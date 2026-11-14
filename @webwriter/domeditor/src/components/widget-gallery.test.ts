// @vitest-environment happy-dom
import {afterEach, beforeEach, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"
import {setLanguage, t} from "../site-language"
import {EditorView} from "@codemirror/view"

const {search, fetchSnippet, resolveDependencies, registryLocales} = vi.hoisted(() => ({
  search: vi.fn(), fetchSnippet: vi.fn(), resolveDependencies: vi.fn(), registryLocales: [] as (string | undefined)[],
}))
vi.mock("../packages", async importOriginal => ({
  ...await importOriginal<typeof import("../packages")>(),
  WebWriterPackageRegistry: class {
    constructor(_fetcher?: unknown, locale?: string) { registryLocales.push(locale) }
    search = search; fetchSnippet = fetchSnippet
    async getLatestPackage(name: string) { return (await search()).find((pkg: WebWriterPackage) => pkg.name === name) }
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
  history.replaceState({}, "", "/")
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
  const tryLink = root.querySelector<HTMLAnchorElement>(".try")!
  expect(tryLink.textContent?.trim()).toBe(t("Try"))
  expect(tryLink.getAttribute("aria-label")).toBe(t("Try {name}", {name: "History"}))
  expect(tryLink.querySelector('[aria-hidden="true"] svg')).not.toBeNull()
  expect(root.querySelector(".card-heading .try")).toBe(tryLink)
  expect(root.querySelector(".component")).toBeNull()
  expect([...root.querySelectorAll<HTMLAnchorElement>(".cards a")].some(link => link.hostname === "www.npmjs.com")).toBe(false)
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
function ariaLink(root: ShadowRoot, label: string) {
  return root.querySelector<HTMLAnchorElement>(`a[aria-label="${label}"]`)!
}
function ariaButton(root: ShadowRoot, label: string) {
  return root.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
}
function memberButton(root: ShadowRoot, label: string) {
  return [...root.querySelectorAll<HTMLButtonElement>('[role="tablist"] [role="tab"]')].find(tab => tab.textContent?.trim() === label)!
}
async function open(root: ShadowRoot) {
  const action = root.querySelector<HTMLAnchorElement>("a.try")!
  action.click()
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

it("shows standard package tags after the gallery card description", async () => {
  const learning = {...fixture(), keywords: ["webwriter-widget", "widget-online", "widget-practical", "widget-responsive", "custom-topic"]}
  const historyPackage = {...fixture(), name: "@webwriter/history", label: "History", keywords: ["webwriter-widget", "another-custom-topic"]}
  search.mockResolvedValue([learning, historyPackage])
  gallery = new WidgetGallery()
  document.body.append(gallery)
  const root = gallery.shadowRoot!
  await vi.waitFor(() => expect(root.querySelectorAll("article")).toHaveLength(2))

  const [untagged, tagged] = root.querySelectorAll("article")
  expect(tagged.querySelector("h3")?.textContent).toBe("Learning")
  const tags = tagged.querySelector("ul.card-keywords")!
  expect(tagged.querySelector(".description")?.nextElementSibling).toBe(tags)
  expect(tags.getAttribute("aria-label")).toBe("Package tags")
  const badges = [...tags.querySelectorAll<HTMLLIElement>("li.keyword-badge")]
  expect(badges.map(badge => [badge.dataset.kind, badge.textContent?.trim()]))
    .toEqual([["type", "Practice"], ["display", "Responsive"], ["online", "Online only"]])
  expect(badges[0].querySelector('.keyword-icon[aria-hidden="true"] svg')).not.toBeNull()
  expect(untagged.querySelector("h3")?.textContent).toBe("History")
  expect(untagged.querySelector(".card-keywords")).toBeNull()
})

it("combines a tag or language with live search and keeps all filter options available", async () => {
  const learning = {...fixture(), keywords: ["webwriter-widget", "widget-practical", "widget-lang-en", "widget-lang-fr", "atoms"]}
  const physics = {...fixture(), name: "@webwriter/physics", label: "Physics",
    description: "Explore science and atoms", keywords: ["webwriter-widget", "widget-simulational", "widget-lang-de"]}
  const historyPackage = {...fixture(), name: "@webwriter/history", label: "History",
    description: "Explore local archives", keywords: ["webwriter-widget", "widget-practical", "widget-lang-EN-gb"]}
  search.mockResolvedValue([learning, physics, historyPackage])
  gallery = new WidgetGallery()
  document.body.append(gallery)
  const root = gallery.shadowRoot!
  const cards = () => [...root.querySelectorAll("article h3")].map(heading => heading.textContent)
  await vi.waitFor(() => expect(cards()).toEqual(["History", "Learning", "Physics"]))

  const filters = root.querySelector("fieldset")!
  expect(filters.querySelector("legend")?.textContent?.trim()).toBe("Filter by tag")
  const tagButtons = () => [...filters.querySelectorAll<HTMLButtonElement>("button.tag-filter")]
  const tagLabel = (button: HTMLButtonElement) => button.textContent?.trim()
  const tagButton = (label: string) => tagButtons().find(button => tagLabel(button) === label)!
  const selectedTags = () => tagButtons().filter(button => button.getAttribute("aria-pressed") === "true").map(tagLabel)
  expect(tagButtons().map(tagLabel).sort()).toEqual(["Practice", "Simulation"])
  expect(selectedTags()).toEqual([])
  expect(tagButton("Practice").dataset.kind).toBe("type")
  expect(tagButton("Practice").querySelector('.keyword-icon[aria-hidden="true"] svg')).not.toBeNull()

  const languageSelects = filters.querySelectorAll<HTMLSelectElement>("select")
  expect(languageSelects).toHaveLength(1)
  const language = languageSelects[0]
  expect(language.getAttribute("aria-label")).toBe("Language")
  expect(language.dataset.kind).toBe("language")
  expect(language.parentElement?.querySelector('.keyword-icon[aria-hidden="true"] svg')).not.toBeNull()
  const languageOptions = () => [...language.options].filter(option => option.value)
  const languageCodes = `en en-US en-GB en-CA en-AU en-IN ar bg zh zh-Hans zh-Hant hr cs da nl et fi fr de el hu ga it lv lt mt
    pl pt pt-PT pt-BR ro ru sk sl es sv fa hi ja ko no nb nn tr uk sr sr-Cyrl sr-Latn sr-ijekavsk cnr sq mk is bs ca
    ca-ES-valencia eu gl cy lb bn pa gu mr te ur kn or ne si ta ml ps jv id ms tl my th lo vi km kk ky mn uz tg ka hy he
    az tk dv be la tpi am om so ti sw ha yue-Hans yue-Hant kmr kmr-Latn kmr-Arab ckb ckb-Arab af-ZA af-NA`.split(/\s+/)
  expect(languageOptions().map(option => option.value).sort()).toEqual(languageCodes.sort())
  const selectLanguage = (code: string) => {
    language.value = code
    expect(language.value).toBe(code)
    language.dispatchEvent(new Event("change", {bubbles: true}))
  }
  const languageLabels = Object.fromEntries(languageOptions().map(option => [option.value, option.text]))
  expect(languageLabels).toMatchObject({en: "English", "en-GB": "English (UK)", fr: "French", de: "German",
    "ca-ES-valencia": "Catalan (Valencian)", "kmr-Latn": "Northern Kurdish (Latin)"})
  const labels = Object.values(languageLabels)
  expect(labels).toEqual([...labels].sort((a, b) => a.localeCompare(b, "en")))

  selectLanguage("en")
  await gallery.updateComplete
  expect(cards()).toEqual(["History", "Learning"])
  selectLanguage("en-GB")
  await gallery.updateComplete
  expect(cards()).toEqual(["History"])
  selectLanguage("ja")
  await gallery.updateComplete
  expect(cards()).toEqual([])
  expect(root.textContent).toContain("No widgets match your search.")

  tagButton("Practice").click()
  await gallery.updateComplete
  expect(cards()).toEqual(["History", "Learning"])
  expect(selectedTags()).toEqual(["Practice"])

  const input = root.querySelector<HTMLInputElement>('input[type="search"]')!
  input.value = "atoms"
  input.dispatchEvent(new Event("input"))
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning"])

  selectLanguage("de")
  await gallery.updateComplete
  expect(cards()).toEqual(["Physics"])
  expect(selectedTags()).toEqual([])

  selectLanguage("fr")
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning"])
  expect(selectedTags()).toEqual([])
  expect(tagButtons()).toHaveLength(2)
  expect(languageOptions()).toHaveLength(languageCodes.length)

  tagButton("Simulation").click()
  await gallery.updateComplete
  expect(cards()).toEqual(["Physics"])
  expect(selectedTags()).toEqual(["Simulation"])
  expect(language.value).toBe("")
  expect(input.value).toBe("atoms")

  tagButton("Practice").click()
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning"])
  expect(selectedTags()).toEqual(["Practice"])

  tagButton("Practice").click()
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning", "Physics"])
  expect(selectedTags()).toEqual([])
  expect(input.value).toBe("atoms")

  selectLanguage("de")
  await gallery.updateComplete
  expect(cards()).toEqual(["Physics"])
  selectLanguage("")
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning", "Physics"])
  expect(selectedTags()).toEqual([])
  expect(input.value).toBe("atoms")
})

it("shows general filter tags before education levels and fields", async () => {
  search.mockResolvedValue([{...fixture(), keywords: [
    "webwriter-widget", "isced2011-6", "iscedf2013-06", "widget-practical",
    "iscedf2013-04", "isced2011-3", "iscedf2013-02", "widget-lang-en",
    "widget-online", "widget-online-use", "widget-online-edit",
  ]}])
  const root = await mount()
  const rows = [...root.querySelectorAll(".tag-filters > .tag-options")]
  expect(rows).toHaveLength(3)
  expect(rows[1].getAttribute("aria-label")).toBe("Level of education")
  expect(rows[2].getAttribute("aria-label")).toBe("Field of education")
  expect(rows.map(row => [...row.querySelectorAll<HTMLButtonElement>("button.tag-filter")]
    .map(button => [button.textContent?.trim(), button.dataset.kind])))
    .toEqual([
      [["Online when editing", "online"], ["Online when using", "online"], ["Practice", "type"], ["Online only", "online"]],
      [["High school", "level"], ["Bachelor's", "level"]],
      [["Humanities", "field"], ["Business", "field"], ["ICT", "field"]],
    ])
  expect(rows[0].querySelector('select[aria-label="Language"]')).not.toBeNull()
  expect(root.querySelector(".more-tag-filters-toggle")).toBeNull()
})

it("replaces Show more with extra education filters inline and shows only the selected extra badge", async () => {
  const learning = {...fixture(), keywords: [
    "webwriter-widget", "widget-practical", "isced2011-5", "isced2011-4", "isced2011-8",
    "isced2011-6", "isced2011-1", "isced2011-0", "iscedf2013-02",
  ]}
  const science = {...fixture(), name: "@webwriter/science", label: "Science",
    keywords: ["webwriter-widget", "widget-simulational"]}
  search.mockResolvedValue([learning, science])
  gallery = new WidgetGallery()
  document.body.append(gallery)
  const root = gallery.shadowRoot!
  const cards = () => [...root.querySelectorAll("article h3")].map(heading => heading.textContent)
  await vi.waitFor(() => expect(cards()).toEqual(["Learning", "Science"]))

  const levelRow = () => root.querySelector('[role="group"][aria-label="Level of education"]')!
  const levelButtons = () => [...levelRow().children].filter(control => control.matches("button.tag-filter"))
    .map(control => control.textContent?.trim())
  const toggle = () => root.querySelector<HTMLButtonElement>(".more-tag-filters-toggle")
  const levels = () => [...root.querySelectorAll(".card-keywords [data-kind='level']")].map(badge => badge.textContent?.trim())
  expect(toggle()?.textContent?.trim()).toBe("Show more…")
  expect(levelRow().lastElementChild).toBe(toggle())
  expect(levelRow().nextElementSibling?.getAttribute("aria-label")).toBe("Field of education")
  expect(levelButtons()).toEqual(["Bachelor's"])
  expect(levels()).toEqual(["Bachelor's"])

  toggle()!.click()
  await gallery.updateComplete
  const expandedLevels = ["Bachelor's", "Preschool", "Primary school", "Doctorate", "Vocational cert.", "Associate deg."]
  expect(toggle()).toBeNull()
  expect(levelButtons()).toEqual(expandedLevels)
  expect(root.activeElement).toBe(button(root, "Preschool"))
  button(root, "Primary school").click()
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning"])
  expect(levels()).toEqual(["Primary school", "Bachelor's"])
  expect(button(root, "Primary school").getAttribute("aria-pressed")).toBe("true")

  ariaLink(root, "Try Learning").click()
  await vi.waitFor(() => expect(root.querySelector(".details-keywords")).not.toBeNull())
  expect([...root.querySelectorAll(".details-keywords [data-kind='level']")].map(badge => badge.textContent?.trim()))
    .toEqual(["Primary school", "Bachelor's"])

  ariaLink(root, "Back to gallery").click()
  await gallery.updateComplete
  expect(toggle()).toBeNull()
  expect(levelButtons()).toEqual(expandedLevels)
  button(root, "Primary school").click()
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning", "Science"])
  expect(levels()).toEqual(["Bachelor's"])

  button(root, "Doctorate").click()
  await gallery.updateComplete
  expect(cards()).toEqual(["Learning"])
  expect(levels()).toEqual(["Bachelor's", "Doctorate"])

  button(root, "Practice").click()
  await gallery.updateComplete
  expect(levelButtons()).toEqual(expandedLevels)
  expect(levels()).toEqual(["Bachelor's"])
  expect(button(root, "Practice").getAttribute("aria-pressed")).toBe("true")
  expect(cards()).toEqual(["Learning"])
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
  const learner = new DOMParser().parseFromString(payload.html, "text/html")
  expect(learner.querySelector("body > gallery-test-widget")).toBeNull()
  expect(learner.querySelector<HTMLTemplateElement>("template#webwriter-gallery-content")?.content.querySelector("gallery-test-widget")).not.toBeNull()
  expect(new URL(learner.querySelector<HTMLScriptElement>('script[src*="gallery-preview-entry"]')!.src).searchParams.get("tags")).toBe("gallery-test-widget")
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
  expect(ariaLink(root, "Back to gallery").getAttribute("href")).toBe("/packages/")
  expect(root.querySelector('a[aria-label="Close"]')).toBeNull()
  ariaLink(root, "Back to gallery").click()
  await vi.waitFor(() => expect(root.querySelector("iframe")).toBeNull())
})

it("opens a package URL from the gallery and closes a deep link back to the package list", async () => {
  const pkg = fixture()
  pkg.authors = ["Ada Lovelace"]
  pkg.license = "MIT"
  pkg.links = {
    npm: "https://www.npmjs.com/package/@webwriter/learning",
    homepage: "https://example.org/widget",
    repository: "https://github.com/example/widget",
    bugs: "https://github.com/example/widget/issues",
  }
  pkg.keywords = ["webwriter-widget", "widget-online", "widget-practical", "isced2011-0", "custom-topic"]
  search.mockResolvedValue([pkg])
  const root = await mount()
  expect(location.pathname).toBe("/")
  const cardLink = root.querySelector<HTMLAnchorElement>("a.try")!
  expect(cardLink.textContent?.trim()).toBe(t("Try"))
  expect(cardLink.getAttribute("aria-label")).toBe(t("Try {name}", {name: "Learning"}))
  expect(root.querySelector(".card-heading .try")).toBe(cardLink)
  expect(root.querySelector(".component")).toBeNull()
  expect([...root.querySelectorAll<HTMLAnchorElement>(".cards a")].some(link => link.hostname === "www.npmjs.com")).toBe(false)
  expect(cardLink.getAttribute("href")).toBe("/packages/@webwriter/learning/")
  cardLink.click()
  await vi.waitFor(() => expect(root.querySelector(".package-page")).not.toBeNull())
  expect(location.pathname).toBe("/packages/@webwriter/learning/")
  const page = root.querySelector<HTMLElement>(".package-page")!
  const title = page.querySelector<HTMLElement>(".details-title")!
  expect(title.textContent).toContain("Learning")
  expect(title.textContent).toContain("@webwriter/learning@1.0.0")
  expect(title.textContent!.indexOf("Learning")).toBeLessThan(title.textContent!.indexOf("@webwriter/learning@1.0.0"))
  const byline = page.querySelector<HTMLElement>(".details-byline")!
  expect(byline.textContent).toContain("Ada Lovelace")
  expect(byline.textContent).toContain("MIT")
  expect(page.textContent).toContain("Practice science")
  expect(page.textContent).toContain("Practice")
  expect(page.textContent).toContain("custom-topic")
  expect(page.querySelector('.details-keyword[data-kind="widget"]')).toBeNull()
  expect(page.querySelector('.details-keyword[data-kind="level"]')).toBeNull()
  expect(page.querySelector(".details-keywords")?.lastElementChild?.textContent?.trim()).toBe("Online only")
  expect([...page.querySelectorAll<HTMLAnchorElement>('a[href^="http"]')].map(link => link.href)).toEqual([pkg.links.npm])
  expect(title.querySelector("a")?.textContent).toBe("@webwriter/learning@1.0.0")
  expect(ariaLink(root, "Back to gallery").getAttribute("href")).toBe("/packages/")
  expect(root.querySelector('a[aria-label="Close"]')).toBeNull()
  ariaLink(root, "Back to gallery").click()
  await gallery.updateComplete
  expect(location.pathname).toBe("/packages/")

  history.replaceState({}, "", "/packages/@webwriter/learning/")
  gallery.remove()
  gallery = new WidgetGallery()
  document.body.append(gallery)
  const deepRoot = gallery.shadowRoot!
  await vi.waitFor(() => expect(deepRoot.querySelector(".details-title")?.textContent).toContain("Learning"))
  const deepPage = deepRoot.querySelector<HTMLElement>(".package-page")!
  expect(deepPage.querySelector(".details-title")?.textContent).toContain("@webwriter/learning@1.0.0")
  expect(deepPage.querySelector(".details-byline")?.textContent).toContain("Ada Lovelace")
  expect(deepPage.querySelector(".details-byline")?.textContent).toContain("MIT")
  expect(deepPage.textContent).toContain("Practice")
  expect(deepPage.textContent).toContain("custom-topic")
  expect(deepPage.querySelector('.details-keyword[data-kind="widget"]')).toBeNull()
  expect(deepPage.querySelector('.details-keyword[data-kind="level"]')).toBeNull()
  expect(deepPage.querySelector(".details-keywords")?.lastElementChild?.textContent?.trim()).toBe("Online only")
  expect(deepPage.querySelector(".details-title a")?.getAttribute("href")).toBe(pkg.links.npm)
  expect(deepPage.querySelectorAll('a[href^="http"]')).toHaveLength(1)
  expect(ariaLink(deepRoot, "Back to gallery").getAttribute("href")).toBe("/packages/")
  expect(deepRoot.querySelector('a[aria-label="Close"]')).toBeNull()
  ariaLink(deepRoot, "Back to gallery").click()
  await gallery.updateComplete
  expect(location.pathname).toBe("/packages/")
})

it("switches gallery previews between Single/Shared and Editing/Reading after each frame is ready", async () => {
  const root = await mount()
  const primary = await open(root)
  const layout = (name: string) => button(root, name)
  expect(layout("Single").getAttribute("aria-pressed")).toBe("true")
  expect(layout("Shared").getAttribute("aria-pressed")).toBe("false")
  expect(layout("Editing").getAttribute("aria-pressed")).toBe("true")
  expect(layout("Reading").getAttribute("aria-pressed")).toBe("false")

  const primaryPost = vi.spyOn(primary.contentWindow!, "postMessage")
  message(primary, {type: "gallery-preview-ready"})
  await vi.waitFor(() => expect(primaryPost.mock.calls.some(([data]) =>
    (data as {type?: string}).type === "gallery-preview-configure")).toBe(true))
  const initial = primaryPost.mock.calls
    .map(([data]) => data as {type?: string, editing?: boolean, shared?: boolean})
    .find(data => data.type === "gallery-preview-configure")!
  expect(initial).toMatchObject({editing: true, shared: false})

  layout("Shared").click()
  await vi.waitFor(() => expect(root.querySelectorAll("iframe")).toHaveLength(2))
  const peer = root.querySelectorAll("iframe")[1]
  const peerPost = vi.spyOn(peer.contentWindow!, "postMessage")
  await gallery.updateComplete
  expect(peerPost.mock.calls.some(([data]) =>
    (data as {type?: string}).type === "gallery-preview-configure")).toBe(false)
  expect(root.querySelector("iframe")).toBe(primary)
  expect(layout("Shared").getAttribute("aria-pressed")).toBe("true")

  message(peer, {type: "gallery-preview-ready"})
  await vi.waitFor(() => expect(peerPost.mock.calls.some(([data]) =>
    (data as {type?: string}).type === "gallery-preview-configure")).toBe(true))
  expect(primaryPost.mock.calls.some(([data]) => {
    const value = data as {type?: string, editing?: boolean, shared?: boolean}
    return value.type === "gallery-preview-configure" && value.editing === true && value.shared === true
  })).toBe(true)

  layout("Reading").click()
  await vi.waitFor(() => expect(primaryPost.mock.calls.some(([data]) => {
    const value = data as {type?: string, editing?: boolean, shared?: boolean}
    return value.type === "gallery-preview-configure" && value.editing === false && value.shared === true
  })).toBe(true))
  expect(layout("Reading").getAttribute("aria-pressed")).toBe("true")
  layout("Editing").click()
  await vi.waitFor(() => expect(primaryPost.mock.calls.some(([data]) => {
    const value = data as {type?: string, editing?: boolean, shared?: boolean}
    return value.type === "gallery-preview-configure" && value.editing === true && value.shared === true
  })).toBe(true))
  expect(layout("Editing").getAttribute("aria-pressed")).toBe("true")
  expect(root.querySelector("iframe")).toBe(primary)
  expect(root.querySelectorAll("iframe")[1]).toBe(peer)

  layout("Single").click()
  await vi.waitFor(() => expect(root.querySelectorAll("iframe")).toHaveLength(1))
  expect(root.querySelector("iframe")).toBe(primary)
  expect(layout("Single").getAttribute("aria-pressed")).toBe("true")
  expect(primaryPost.mock.calls.some(([data]) => {
    const value = data as {type?: string, editing?: boolean, shared?: boolean}
    return value.type === "gallery-preview-configure" && value.editing === true && value.shared === false
  })).toBe(true)
})

it("shows authenticated HTML snapshots for each participant and preview mode", async () => {
  const root = await mount()
  const primary = await open(root)
  const code = ariaButton(root, "Code")
  message(primary, {type: "gallery-preview-ready"})
  code.click()
  const editor = () => {
    const element = root.querySelector<HTMLElement>(".cm-editor")
    return element && EditorView.findFromDOM(element)
  }
  await vi.waitFor(() => expect(editor()).toBeDefined())

  message(primary, {
    type: "gallery-preview-html", editing: true, shared: false,
    html: "<p>Rendered editing markup</p>", editableHTML: "<p>Editable editing markup</p>",
  })
  await vi.waitFor(() => expect(editor()?.state.doc.toString()).toBe("<p>Editable editing markup</p>"))

  button(root, "Shared").click()
  await vi.waitFor(() => expect(root.querySelectorAll("iframe")).toHaveLength(2))
  const peer = root.querySelectorAll("iframe")[1]
  message(peer, {type: "gallery-preview-ready"})
  button(root, "Reading").click()
  message(primary, {
    type: "gallery-preview-html", editing: false, shared: true,
    html: "<p>Primary reading markup</p>", editableHTML: "<p>Stale editing markup</p>",
  })
  await vi.waitFor(() => expect(editor()?.state.doc.toString()).toBe("<p>Primary reading markup</p>"))

  const participants = root.querySelector<HTMLSelectElement>('select[aria-label="Preview participants"]')!
  expect([...participants.options].map(option => option.value)).toEqual(["0", "1"])
  message(peer, {
    type: "gallery-preview-html", editing: false, shared: true,
    html: "<p>Peer reading markup</p>", editableHTML: "<p>Peer stale markup</p>",
  })
  await gallery.updateComplete
  expect(editor()?.state.doc.toString()).toBe("<p>Primary reading markup</p>")
  participants.value = "1"
  participants.dispatchEvent(new Event("change", {bubbles: true}))
  await vi.waitFor(() => expect(editor()?.state.doc.toString()).toBe("<p>Peer reading markup</p>"))
  participants.value = "0"
  participants.dispatchEvent(new Event("change", {bubbles: true}))
  await vi.waitFor(() => expect(editor()?.state.doc.toString()).toBe("<p>Primary reading markup</p>"))

  const active = memberButton(root, "Experiment")
  expect(active.title).toBe("Reset example")
  active.click()
  await vi.waitFor(() => {
    expect(root.querySelectorAll("iframe")).toHaveLength(2)
    expect(root.querySelector("iframe")).not.toBe(primary)
    expect(editor()?.state.doc.toString()).toBe("<gallery-test-widget></gallery-test-widget>")
  })
  expect(button(root, "Reading").getAttribute("aria-pressed")).toBe("true")
})

it("switches members into fresh frames and ignores async completion after closing", async () => {
  const pkg = fixture()
  pkg.members.push({...pkg.members[0], id: "second", label: "Second widget", tagName: "gallery-second-widget"})
  search.mockResolvedValue([pkg])
  const root = await mount()
  const first = await open(root)
  const firstURL = first.src
  memberButton(root, "Second widget").click()
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
  memberButton(root, "Experiment").click()
  await vi.waitFor(() => expect(resolveDependencies).toHaveBeenCalledTimes(2))
  ariaLink(root, "Back to gallery").click()
  resolve({entries: [], map: null})
  await gallery.updateComplete
  await Promise.resolve()
  expect(root.querySelector("iframe")).toBeNull()
  expect(root.querySelector(".package-page")).toBeNull()
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
  const frame = await open(root)
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
  const unavailable = {...pkg.members[0], id: "unavailable", label: "Uninsertable widget", tagName: "gallery-uninsertable-widget", insertable: false}
  const snippet = {...pkg.members[0], id: "example", label: "Published activity", kind: "snippet" as const, tagName: undefined, htmlUrl: "https://cdn.example/activity.html"}
  pkg.members.push(second, unavailable, snippet)
  search.mockResolvedValue([pkg])
  fetchSnippet.mockResolvedValue('<gallery-test-widget><p>Published example</p></gallery-test-widget>')
  const root = await mount()
  expect(root.querySelectorAll("article")).toHaveLength(1)
  const first = await open(root)
  expect(root.querySelector("select")).toBeNull()
  const members = root.querySelector('[role="tablist"][aria-label="Widget or snippet"]')!
  expect([...members.querySelectorAll('[role="tab"]')].map(option => option.textContent?.trim())).toEqual([
    "Experiment", "Second widget", "Published activity",
  ])
  const selectedTab = memberButton(root, "Experiment")
  expect(selectedTab.getAttribute("aria-selected")).toBe("true")
  expect(selectedTab.getAttribute("role")).toBe("tab")
  expect([...members.querySelectorAll('[role="tab"]')].some(tab => tab.textContent?.trim() === "Uninsertable widget")).toBe(false)
  const previewPanel = root.querySelector<HTMLElement>('[role="tabpanel"]')!
  expect(previewPanel.getAttribute("aria-labelledby")).toBe(selectedTab.id)
  const nextTab = memberButton(root, "Second widget")
  const firstPreviewFrame = root.querySelector("iframe")!
  selectedTab.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowRight", bubbles: true}))
  expect(root.activeElement).toBe(nextTab)
  expect(selectedTab.getAttribute("aria-selected")).toBe("true")
  expect(nextTab.getAttribute("aria-selected")).toBe("false")
  expect(root.querySelector("iframe")).toBe(firstPreviewFrame)
  expect(root.querySelector<HTMLElement>("#preview-code")?.hidden).toBe(true)
  ariaButton(root, "Code").click()
  const editorFor = () => {
    const view = root.querySelector<HTMLElement>(".cm-editor")
    return view && EditorView.findFromDOM(view)
  }
  await vi.waitFor(() => expect(editorFor()?.state.doc.toString()).toContain("Published example"))
  expect(root.querySelector("iframe")).toBe(first)
  expect(ariaButton(root, "Code").getAttribute("aria-expanded")).toBe("true")
  expect(root.querySelector("#preview-code-title")?.textContent).toBe("Widget HTML")

  const editor = editorFor()!
  editor.dispatch({changes: {from: 0, to: editor.state.doc.length, insert: "<p>Edited example</p>"}})
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")?.src).toBeTruthy()
    expect(root.querySelector("iframe")!.src).not.toBe(first.src)
  })
  const edited = root.querySelector("iframe")!
  const postEdit = vi.spyOn(edited.contentWindow!, "postMessage")
  message(edited, {type: "webwriter-frame-shell-ready", kind: "preview", revision: new URL(edited.src).searchParams.get("revision")})
  const updatedHTML = (postEdit.mock.calls[0][0] as {html: string}).html
  expect(updatedHTML).toContain("<p>Edited example</p>")
  expect(updatedHTML).not.toContain("tag=gallery-test-widget")
  ariaButton(root, "Code").click()
  await gallery.updateComplete
  expect(root.querySelector<HTMLElement>("#preview-code")?.hidden).toBe(true)
  expect(root.querySelector("iframe")).toBe(edited)
  memberButton(root, "Second widget").click()
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")?.src).toBeTruthy()
    expect(root.querySelector("iframe")!.src).not.toBe(edited.src)
  })
  const switchedURL = root.querySelector("iframe")!.src
  memberButton(root, "Experiment").click()
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")?.src).toBeTruthy()
    expect(root.querySelector("iframe")!.src).not.toBe(switchedURL)
  })
  ariaButton(root, "Code").click()
  await vi.waitFor(() => expect(editorFor()?.state.doc.toString()).toContain("Published example"))
  const resetURL = root.querySelector("iframe")!.src

  fetchSnippet.mockResolvedValue('<p>Snippet markup</p>')
  memberButton(root, "Published activity").click()
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")).not.toBeNull()
    expect(root.querySelector("iframe")!.src).not.toBe(resetURL)
  })
  expect(fetchSnippet).toHaveBeenCalledWith(snippet)
  expect(root.querySelector<HTMLElement>("#preview-code")?.hidden).toBe(true)
  const snippetTab = memberButton(root, "Published activity")
  expect(snippetTab.getAttribute("aria-selected")).toBe("true")
  expect(root.querySelector('[role="tabpanel"]')?.getAttribute("aria-labelledby")).toBe(snippetTab.id)
  ariaButton(root, "Code").click()
  await vi.waitFor(() => expect(editorFor()?.state.doc.toString()).toBe("<p>Snippet markup</p>"))
  expect(root.querySelector("#preview-code-title")?.textContent).toBe("Snippet HTML")
  const previousURL = root.querySelector("iframe")!.src
  memberButton(root, "Second widget").click()
  await vi.waitFor(() => {
    expect(root.querySelector("iframe")).not.toBeNull()
    expect(root.querySelector("iframe")!.src).not.toBe(previousURL)
  })
  expect(root.querySelectorAll("article")).toHaveLength(1)
  expect(memberButton(root, "Second widget").getAttribute("aria-selected")).toBe("true")
  const frame = root.querySelector("iframe")!
  const post = vi.spyOn(frame.contentWindow!, "postMessage")
  message(frame, {type: "webwriter-frame-shell-ready", kind: "preview", revision: new URL(frame.src).searchParams.get("revision")})
  expect((post.mock.calls[0][0] as {html: string}).html).toContain("<gallery-second-widget>")
})

it("scrolls overflowing member tabs without changing the selected member", async () => {
  const pkg = fixture()
  pkg.members.push(
    {...pkg.members[0], id: "second", label: "Second widget", tagName: "gallery-second-widget"},
    {...pkg.members[0], id: "third", label: "Third widget", tagName: "gallery-third-widget"},
  )
  search.mockResolvedValue([pkg])
  const root = await mount()
  await open(root)
  const scrollport = root.querySelector<HTMLElement>(".preview-tab-scrollport")!
  const left = root.querySelector<HTMLButtonElement>('button[aria-label="Scroll tabs left"]')!
  const right = root.querySelector<HTMLButtonElement>('button[aria-label="Scroll tabs right"]')!
  expect(left.hidden).toBe(true)
  expect(right.hidden).toBe(true)
  Object.defineProperties(scrollport, {
    clientWidth: {configurable: true, value: 100},
    scrollWidth: {configurable: true, value: 300},
    scrollLeft: {configurable: true, writable: true, value: 0},
  })
  const scrollBy = vi.fn()
  Object.defineProperty(scrollport, "scrollBy", {configurable: true, value: scrollBy})
  scrollport.dispatchEvent(new Event("scroll"))
  await gallery.updateComplete
  expect(left.hidden).toBe(false)
  expect(right.hidden).toBe(false)
  expect(left.getAttribute("aria-disabled")).toBe("true")
  expect(right.getAttribute("aria-disabled")).toBe("false")

  const selected = memberButton(root, "Experiment")
  right.click()
  expect(scrollBy).toHaveBeenCalledWith({left: 80})
  expect(selected.getAttribute("aria-selected")).toBe("true")

  scrollport.scrollLeft = 80
  scrollport.dispatchEvent(new Event("scroll"))
  await gallery.updateComplete
  expect(left.getAttribute("aria-disabled")).toBe("false")
  expect(right.getAttribute("aria-disabled")).toBe("false")
  scrollport.scrollLeft = 200
  scrollport.dispatchEvent(new Event("scroll"))
  await gallery.updateComplete
  expect(left.getAttribute("aria-disabled")).toBe("false")
  expect(right.getAttribute("aria-disabled")).toBe("true")
  expect(selected.getAttribute("aria-selected")).toBe("true")
})

it("loads wall cards immediately and links each widget tile to its package page", async () => {
  const observer = vi.fn()
  vi.stubGlobal("IntersectionObserver", observer)
  try {
    search.mockResolvedValue([fixture(), {...fixture(), name: "@other/widget", label: "Unrelated"}])
    gallery = new WidgetGallery()
    gallery.wall = true
    document.body.append(gallery)
    expect(search).toHaveBeenCalledOnce()
    expect(observer).not.toHaveBeenCalled()
    await vi.waitFor(() => expect(gallery.shadowRoot!.querySelectorAll(".widget-tile")).toHaveLength(1))
    const root = gallery.shadowRoot!
    expect(root.querySelector("input")).toBeNull()
    expect(root.textContent).not.toContain("Unrelated")
    expect(root.querySelectorAll(".cards")).toHaveLength(1)
    const tile = root.querySelector<HTMLAnchorElement>(".widget-tile")!
    expect(tile.tagName).toBe("A")
    expect(tile.getAttribute("data-card-overlay")).toBe("Show widget")
    expect(tile.getAttribute("aria-label")).toBe("Try Learning")
    expect(tile.getAttribute("href")).toBe("/packages/@webwriter/learning/")
    expect(root.querySelector(".description, .package, .component")).toBeNull()
    expect(root.querySelector("iframe")).toBeNull()
    expect(search).toHaveBeenCalledOnce()
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
    expect(gallery.shadowRoot!.querySelector('[role="alert"] a')?.getAttribute("href")).toBe("/packages/")
  }
  finally {vi.unstubAllGlobals()}
})
