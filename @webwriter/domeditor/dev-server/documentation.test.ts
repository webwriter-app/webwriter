// @vitest-environment happy-dom
import {existsSync, readFileSync} from "node:fs"
import {resolve} from "node:path"
import {afterEach, beforeEach, expect, it, vi} from "vitest"

const key = "webwriter-docs-sidebar-scroll"
const widgetDocs = resolve("docs/widgets")
const overview = readFileSync(resolve(widgetDocs, "index.md"), "utf8")

function guideMap() {
  document.body.innerHTML = overview.match(/<nav class="widget-capabilities"[\s\S]*?<\/nav>/)![0]
  return document.querySelector<HTMLElement>(".widget-capabilities")!
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  document.body.innerHTML = "<aside><nav>Documentation</nav></aside>"
  Object.defineProperty(document.querySelector("aside"), "clientHeight", {value: 400, configurable: true})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  vi.useRealTimers()
  document.body.innerHTML = ""
  sessionStorage.clear()
})

it("retains the sidebar position when another documentation page loads", async () => {
  await import("./documentation.js")
  const sidebar = document.querySelector("aside")!
  sidebar.scrollTop = 275
  sidebar.dispatchEvent(new Event("scroll"))

  document.body.innerHTML = "<aside><nav>A different page</nav></aside>"
  vi.resetModules()
  await import("./documentation.js")
  expect(document.querySelector("aside")!.scrollTop).toBe(275)
})

it("does not overwrite the desktop position while the sidebar is hidden", async () => {
  sessionStorage.setItem(key, "275")
  await import("./documentation.js")
  const sidebar = document.querySelector("aside")!
  Object.defineProperty(sidebar, "clientHeight", {value: 0})
  sidebar.scrollTop = 0
  sidebar.dispatchEvent(new Event("scroll"))
  expect(sessionStorage.getItem(key)).toBe("275")
})

it("ignores invalid stored positions", async () => {
  sessionStorage.setItem(key, "invalid")
  await import("./documentation.js")
  expect(document.querySelector("aside")!.scrollTop).toBe(0)
})

it("continues when browser storage is disabled", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage disabled") })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled") })
  await expect(import("./documentation.js")).resolves.toBeDefined()
  expect(() => document.querySelector("aside")!.dispatchEvent(new Event("scroll"))).not.toThrow()
})

it("switches pre-rendered library pages while preserving the query and fragment", async () => {
  document.body.innerHTML = '<select name="library"><option value="lit" selected>Lit</option><option value="react" data-href="/docs/widgets/tutorial/01-setup.react.html?library=react">React</option></select>'
  const assign = vi.fn()
  vi.stubGlobal("location", {href: "https://example.test/docs/widgets/tutorial/01-setup.html?step=2#setup", assign})
  try {
    await import("./documentation.js")
    const select = document.querySelector("select")!
    select.value = "react"
    select.dispatchEvent(new Event("change"))
    expect(assign.mock.calls[0][0].href).toBe("https://example.test/docs/widgets/tutorial/01-setup.react.html?step=2&library=react#setup")
  }
  finally { vi.unstubAllGlobals() }
})

it("opens the requested static library variant from an existing query link", async () => {
  document.body.innerHTML = '<select name="library"><option value="lit" selected>Lit</option><option value="vue" data-href="/docs/widgets/index.vue.html?library=vue">Vue</option></select>'
  const replace = vi.fn()
  vi.stubGlobal("location", {href: "https://example.test/docs/?library=vue#widgets", replace})
  try {
    await import("./documentation.js")
    expect(replace.mock.calls[0][0].href).toBe("https://example.test/docs/widgets/index.vue.html?library=vue#widgets")
  }
  finally { vi.unstubAllGlobals() }
})

it("gives every widget guide a direct link, a distinct icon, and an illustrated preview", () => {
  const map = guideMap()
  const links = [...map.querySelectorAll("a")]
  const guideIndex = readFileSync(resolve(widgetDocs, "guides/index.md"), "utf8")
  const indexOrder = [...guideIndex.matchAll(/^\| \[[^\n]+\]\(([\w-]+\.md)\)/gm)].map(([, path]) => `guides/${path}`)
  expect(links.map(link => link.getAttribute("href"))).toEqual(indexOrder)
  const icons = new Set<string>()
  for(const link of links) {
    expect(existsSync(resolve(widgetDocs, link.getAttribute("href")!))).toBe(true)
    expect(link.textContent?.trim()).toBeTruthy()
    expect(document.getElementById(link.getAttribute("aria-describedby")!)?.textContent?.trim()).toBeTruthy()
    const icon = link.querySelector('svg[aria-hidden="true"] use')!.getAttribute("href")!
    const [sprite, id] = icon.split("#")
    expect(readFileSync(resolve(widgetDocs, sprite), "utf8")).toContain(`<symbol id="${id}"`)
    icons.add(icon)
    expect(link.querySelector("img")).toBeNull()
    const illustration = link.querySelector("template")!.content.querySelector("img")!.getAttribute("src")!
    expect(existsSync(resolve(widgetDocs, illustration))).toBe(true)
  }
  expect(icons.size).toBe(indexOrder.length)
})

it("previews guides on hover and focus and dismisses them without moving focus", async () => {
  vi.useFakeTimers()
  const hover = new EventTarget()
  Object.assign(hover, {matches: true})
  vi.stubGlobal("matchMedia", () => hover)
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 20, 160, 40))
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(800)
  const map = guideMap()
  const content = map.querySelector<HTMLAnchorElement>('a[href="guides/content.md"]')!
  const editing = map.querySelector<HTMLAnchorElement>('a[href="guides/editing.md"]')!
  const preview = map.querySelector<HTMLElement>(".widget-capabilities-preview")!
  Object.defineProperty(preview, "showPopover", {value: undefined})
  await import("./documentation.js")

  content.dispatchEvent(new PointerEvent("pointermove", {pointerType: "mouse"}))
  expect(preview.hidden).toBe(false)
  expect(preview.textContent).toContain("Use slots")
  expect(preview.querySelector("img")?.getAttribute("src")).toBe("../images/widgets/content.svg")
  content.dispatchEvent(new PointerEvent("pointerleave"))
  preview.dispatchEvent(new PointerEvent("pointerenter"))
  await vi.advanceTimersByTimeAsync(200)
  expect(preview.hidden).toBe(false)
  preview.dispatchEvent(new PointerEvent("pointerleave"))
  await vi.advanceTimersByTimeAsync(200)
  expect(preview.hidden).toBe(true)

  editing.focus()
  expect(preview.hidden).toBe(false)
  expect(preview.textContent).toContain("Show configuration")
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
  expect(preview.hidden).toBe(true)
  expect(document.activeElement).toBe(editing)
})
