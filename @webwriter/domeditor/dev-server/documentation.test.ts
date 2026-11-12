// @vitest-environment happy-dom
import {existsSync, readFileSync} from "node:fs"
import {resolve} from "node:path"
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import widgetKeywords from "../src/widget-keywords.json"

const key = "webwriter-docs-sidebar-scroll"
const sidebarSelector = ".documentation-sections"
const widgetDocs = resolve("docs/widgets")
const overview = readFileSync(resolve(widgetDocs, "index.md"), "utf8")

function guideMap() {
  document.body.innerHTML = overview.match(/<nav class="widget-capabilities"[\s\S]*?<\/nav>/)![0]
  return document.querySelector<HTMLElement>(".widget-capabilities")!
}

beforeEach(() => {
  vi.resetModules()
  sessionStorage.clear()
  document.body.innerHTML = '<aside><nav><div class="documentation-sections">Documentation</div></nav></aside>'
  Object.defineProperty(document.querySelector(sidebarSelector), "clientHeight", {value: 400, configurable: true})
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
  const sidebar = document.querySelector(sidebarSelector)!
  sidebar.scrollTop = 275
  sidebar.dispatchEvent(new Event("scroll"))

  document.body.innerHTML = '<aside><nav><div class="documentation-sections">A different page</div></nav></aside>'
  vi.resetModules()
  await import("./documentation.js")
  expect(document.querySelector(sidebarSelector)!.scrollTop).toBe(275)
})

it("does not overwrite the desktop position while the sidebar is hidden", async () => {
  sessionStorage.setItem(key, "275")
  await import("./documentation.js")
  const sidebar = document.querySelector(sidebarSelector)!
  Object.defineProperty(sidebar, "clientHeight", {value: 0})
  sidebar.scrollTop = 0
  sidebar.dispatchEvent(new Event("scroll"))
  expect(sessionStorage.getItem(key)).toBe("275")
})

it("ignores invalid stored positions", async () => {
  sessionStorage.setItem(key, "invalid")
  await import("./documentation.js")
  expect(document.querySelector(sidebarSelector)!.scrollTop).toBe(0)
})

it("continues when browser storage is disabled", async () => {
  vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => { throw new Error("Storage disabled") })
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("Storage disabled") })
  await expect(import("./documentation.js")).resolves.toBeDefined()
  expect(() => document.querySelector(sidebarSelector)!.dispatchEvent(new Event("scroll"))).not.toThrow()
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

it("shows ten sample lines and reveals the full source and companion files together", async () => {
  const lines = Array.from({length: 12}, (_, index) => `line ${index + 1}`)
  const source = lines.map(line => `<span class="line">${line}</span>`).join("\n")
  document.body.innerHTML = `<section class="library-note" data-library="vue">
    <figure class="code-snippet"><pre tabindex="0"><code>${source}</code></pre></figure>
    <figure class="code-snippet"><pre><code>registration</code></pre></figure>
  </section>`
  await import("./documentation.js")

  const code = document.querySelector("pre > code")!
  const rest = document.getElementById("library-source-vue-rest")!
  const files = document.getElementById("library-source-vue-files")!
  const button = document.querySelector<HTMLButtonElement>(".library-source-toggle")!
  expect(code.querySelectorAll(":scope > .line")).toHaveLength(10)
  expect(code.textContent).toBe(lines.join("\n"))
  expect(rest.textContent).toBe("\nline 11\nline 12")
  expect(rest.hasAttribute("hidden")).toBe(true)
  expect(files.hasAttribute("hidden")).toBe(true)
  expect(button.getAttribute("aria-controls")).toBe("library-source-vue-rest library-source-vue-files")
  expect(button.textContent).toBe("Show more...")

  button.click()
  expect(rest.hasAttribute("hidden")).toBe(false)
  expect(files.hasAttribute("hidden")).toBe(false)
  expect(button.getAttribute("aria-expanded")).toBe("true")
  expect(button.textContent).toBe("Show less")

  button.click()
  expect(rest.hasAttribute("hidden")).toBe(true)
  expect(files.hasAttribute("hidden")).toBe(true)
  expect(button.getAttribute("aria-expanded")).toBe("false")
  rest.dispatchEvent(new Event("beforematch"))
  expect(files.hasAttribute("hidden")).toBe(false)
  expect(button.getAttribute("aria-expanded")).toBe("true")
})

it("copies the heading URL with its query and fragment while leaving native link activation intact", async () => {
  vi.useFakeTimers()
  const originalURL = location.href
  history.replaceState(null, "", "/docs/widgets/guides/editing.md?library=vue#old")
  const writeText = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal("navigator", {clipboard: {writeText}})
  document.body.innerHTML = '<main><article><h2 id="editing"><span class="docs-heading-link-status" role="status"></span><a class="docs-heading-link" href="#editing">#</a>Editing</h2></article></main>'
  const status = document.querySelector('[role="status"]')!
  const link = document.querySelector<HTMLAnchorElement>(".docs-heading-link")!
  const click = (options: MouseEventInit = {}) => link.dispatchEvent(new MouseEvent("click", {bubbles: true, cancelable: true, ...options}))

  try {
    await import("./documentation.js")
    expect(click({ctrlKey: true})).toBe(true)
    expect(writeText).not.toHaveBeenCalled()
    expect(click()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(writeText).toHaveBeenCalledWith(new URL("#editing", location.href).href)
    expect(status.textContent).toBe("Link copied")
    await vi.advanceTimersByTimeAsync(2000)
    expect(status.textContent).toBe("")

    writeText.mockRejectedValueOnce(new Error("Clipboard denied"))
    expect(click()).toBe(true)
    await vi.advanceTimersByTimeAsync(0)
    expect(status.textContent).toBe("Couldn’t copy link")
  } finally {
    history.replaceState(null, "", originalURL)
  }
})

it("gives every widget guide a direct link, a distinct icon, and an illustrated preview", () => {
  const map = guideMap()
  const links = [...map.querySelectorAll("a")]
  const indexOrder = Object.keys(widgetKeywords.guides).map(guide => `guides/${guide}.md`)
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

it("documents every keyword used by guide badges", () => {
  const reference = readFileSync(resolve(widgetDocs, "reference/keywords.md"), "utf8")
  for(const keywords of Object.values(widgetKeywords.guides)) {
    expect(keywords.length).toBeGreaterThan(0)
    for(const keyword of keywords) {
      const badge = widgetKeywords.badges[keyword as keyof typeof widgetKeywords.badges]
      expect(badge).toBeDefined()
      const pattern = "pattern" in badge ? badge.pattern : keyword
      expect(reference).toContain("`" + pattern.replaceAll("|", "\\|") + "`")
    }
  }
})

it("previews guides on hover and focus and dismisses them without moving focus", async () => {
  vi.useFakeTimers()
  const hover = new EventTarget()
  Object.assign(hover, {matches: true})
  vi.stubGlobal("matchMedia", () => hover)
  vi.spyOn(document.documentElement, "clientWidth", "get").mockReturnValue(1000)
  vi.spyOn(document.documentElement, "clientHeight", "get").mockReturnValue(800)
  const map = guideMap()
  const content = map.querySelector<HTMLAnchorElement>('a[href="guides/content.md"]')!
  const editing = map.querySelector<HTMLAnchorElement>('a[href="guides/editing.md"]')!
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 240, 160, 40))
  vi.spyOn(editing, "getBoundingClientRect").mockReturnValue(new DOMRect(20, 80, 160, 40))
  content.querySelector("template")!.content.appendChild(Object.assign(document.createElement("ul"), {
    className: "details-keywords guide-keywords", innerHTML: '<li><span class="details-keyword">Has content</span></li>',
  }))
  document.getElementById(content.getAttribute("aria-describedby")!)!.innerHTML =
    'Use a <code>slot</code> to display authored content. Authors can edit that content in place.'
  const preview = map.querySelector<HTMLElement>(".widget-capabilities-preview")!
  vi.spyOn(preview, "getBoundingClientRect").mockImplementation(() =>
    new DOMRect(0, 0, 336, Math.min(320, parseFloat(preview.style.maxBlockSize))))
  Object.defineProperty(preview, "showPopover", {value: undefined})
  await import("./documentation.js")

  content.dispatchEvent(new PointerEvent("pointermove", {pointerType: "mouse"}))
  expect(preview.hidden).toBe(false)
  expect(preview.style.maxBlockSize).toBe("232px")
  expect(preview.style.top).toBe("8px")
  expect(preview.querySelector("p")?.textContent).toBe("Use a slot to display authored content. Authors can edit that content in place.")
  expect(preview.querySelector("p code")?.textContent).toBe("slot")
  expect(preview.lastElementChild?.textContent).toBe("Has content")
  expect(preview.querySelector("p")?.hasAttribute("id")).toBe(false)
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
  expect(preview.style.top).toBe("120px")
  const editingSummary = document.getElementById(editing.getAttribute("aria-describedby")!)!
  expect(preview.querySelector("p")?.textContent).toBe(editingSummary.textContent)
  expect(preview.querySelector(".details-keyword")).toBeNull()
  document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
  expect(preview.hidden).toBe(true)
  expect(document.activeElement).toBe(editing)
})
