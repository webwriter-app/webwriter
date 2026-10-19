// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {createAccessibilityReviewer} from "./accessibility"
import type {Schema} from "./schema"

const {mockRun, mockModuleLoads} = vi.hoisted(() => ({
  mockRun: vi.fn(),
  mockModuleLoads: {count: 0},
}))

vi.mock("axe-core", () => {
  mockModuleLoads.count++
  return {default: {run: mockRun}}
})

function schemaWith(openTags: string[] = []): Schema {
  return {
    get(nodeOrKey: Element | string) {
      const localName = typeof nodeOrKey === "string" ? nodeOrKey : nodeOrKey.localName
      return openTags.includes(localName) ? {content: {selector: "*"}} : undefined
    },
  } as unknown as Schema
}

describe("accessibility reviewer", () => {
  beforeEach(() => {
    mockRun.mockReset()
    mockRun.mockResolvedValue({violations: []})
  })

  it("loads axe only when created and scans the full page with safe options", async () => {
    expect(mockModuleLoads.count).toBe(0)
    const reviewer = await createAccessibilityReviewer()
    expect(mockModuleLoads.count).toBe(1)

    const body = document.body
    await reviewer.check(body, schemaWith())

    const [context, options] = mockRun.mock.calls[0]
    expect(context).toBe(document.documentElement)
    expect(options).toMatchObject({
      elementRef: true,
      iframes: false,
      preload: false,
      resultTypes: ["violations"],
      runOnly: {type: "tag", values: expect.arrayContaining(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])},
    })
  })

  it("preserves the default slot, excludes appendix UI and atomic widget descendants, and maps connected authored elements", async () => {
    document.head.innerHTML = "<title>Page title</title>"
    document.body.innerHTML = "<p>Readable paragraph</p><x-closed><button>Widget control</button></x-closed><x-open><button>Authored control</button></x-open>"
    const paragraph = document.querySelector("p")!
    const atomicChild = document.querySelector("x-closed button")!
    const openChild = document.querySelector("x-open button")!
    const openShadow = document.createElement("button")
    openShadow.textContent = "Widget shadow control"
    const widgetShadow = document.querySelector("x-open")!.attachShadow({mode: "open"})
    const layout = document.createElement("section")
    const widgetSlot = document.createElement("slot")
    layout.append(widgetSlot, openShadow)
    widgetShadow.append(layout)
    const headEditorNode = document.createElement("meta")
    headEditorNode.className = "◆editor-only"
    document.head.append(headEditorNode)
    const appendix = document.body.attachShadow({mode: "open"})
    const slot = document.createElement("slot")
    const chrome = document.createElement("button")
    chrome.textContent = "Editor control"
    appendix.append(slot, chrome)

    mockRun.mockImplementation(async (context: any) => {
      const excluded = context.exclude as Element[]
      expect(excluded).toContain(atomicChild)
      expect(excluded).toContain(chrome)
      expect(excluded).toContain(openShadow)
      expect(excluded).not.toContain(layout)
      expect(excluded).not.toContain(widgetSlot)
      expect(excluded).toContain(headEditorNode)
      expect(excluded).not.toContain(slot)
      return {violations: [{
        id: "image-alt",
        help: "Images must have alternate text",
        helpUrl: "https://example.test/image-alt",
        nodes: [
          {element: paragraph, failureSummary: "  Add a description.  "},
          {element: atomicChild},
          {element: openChild},
          {element: openShadow},
          {element: chrome},
          {element: document.createElement("img")},
        ],
      }]}
    })

    const reviewer = await createAccessibilityReviewer()
    const findings = await reviewer.check(document.body, schemaWith(["x-open"]))
    expect(findings).toEqual([
      {element: paragraph, rule: "image-alt", message: "Images must have alternate text", text: "Readable paragraph", helpUrl: "https://example.test/image-alt"},
      {element: openChild, rule: "image-alt", message: "Images must have alternate text", text: "Authored control", helpUrl: "https://example.test/image-alt"},
    ])
  })

  it("includes page checks and authored children when the editing root is a document widget", async () => {
    document.body.innerHTML = '<x-document role="document"><img></x-document>'
    const root = document.querySelector("x-document")!
    const image = root.querySelector("img")!
    mockRun.mockResolvedValue({violations: [{id: "image-alt", help: "Add alternative text", helpUrl: "https://example.test/alt", nodes: [{element: image}]}]})
    const reviewer = await createAccessibilityReviewer()
    expect(await reviewer.check(root, schemaWith())).toMatchObject([{element: image, rule: "image-alt"}])
    const context = mockRun.mock.calls[0][0]
    expect(context.include).toEqual([document.documentElement])
    expect(context.exclude).not.toContain(image)
  })

  it("labels page findings without exposing head scripts or styles", async () => {
    document.head.innerHTML = '<script class="◆editor-only">globalThis.litIssuedWarnings ??= new Set()</script><style>body { color: red }</style>'
    document.body.innerHTML = '<main><p>Lesson text</p></main>'
    mockRun.mockResolvedValue({violations: [{id: "document-title", help: "Documents must have a title", helpUrl: "https://example.test/title",
      nodes: [{element: document.documentElement}, {element: document.body}, {element: document.head}]}]})
    const reviewer = await createAccessibilityReviewer()
    const before = document.documentElement.outerHTML
    const findings = await reviewer.check(document.body, schemaWith())
    expect(findings.map(finding => finding.text)).toEqual(["Document", "Document", "Document metadata"])
    expect(findings.every(finding => finding.message === "Documents must have a title")).toBe(true)
    expect(document.documentElement.outerHTML).toBe(before)
  })

  it("groups page region violations into one document finding and keeps other rules actionable", async () => {
    document.body.innerHTML = '<header>Site header</header><section>Lesson one</section><aside>Lesson two</aside><img src="lesson.png">'
    const blocks = [...document.body.children]
    const image = document.querySelector("img")!
    const editorOnly = document.createElement("div")
    editorOnly.className = "◆editor-only"
    document.body.append(editorOnly)
    const disconnected = document.createElement("section")
    const before = document.documentElement.outerHTML
    mockRun.mockResolvedValue({violations: [
      {id: "region", help: "All page content should be contained by landmarks", helpUrl: "https://example.test/region",
        nodes: [...blocks.slice(0, 3), editorOnly, disconnected].map(element => ({element}))},
      {id: "image-alt", help: "Images must have alternate text", helpUrl: "https://example.test/image-alt",
        nodes: [{element: image}]},
    ]})
    const reviewer = await createAccessibilityReviewer()

    const findings = await reviewer.check(document.body, schemaWith())

    expect(findings).toEqual([
      {element: image, rule: "image-alt", message: "Images must have alternate text", text: "<img>", helpUrl: "https://example.test/image-alt"},
      {element: document.documentElement, rule: "region", message: "All page content should be contained by landmarks",
        text: "3 blocks outside landmarks. Group related content in a main landmark.", helpUrl: "https://example.test/region"},
    ])
    expect(findings.filter(finding => finding.rule === "region")).toHaveLength(1)
    expect(document.documentElement.outerHTML).toBe(before)
  })

  it("previews authored text without script, style, hidden or editor-only descendants", async () => {
    document.body.innerHTML = '<section><p>Read <strong>this</strong> lesson.</p><script type="application/json">{"warning":"private widget data"}</script><style>p { color: red }</style><span hidden>Hidden warning</span><span inert>Inactive warning</span><span class="◆editor-only">Editor warning</span><span data-webwriter-editor-only>Legacy editor warning</span></section>'
    const section = document.querySelector("section")!
    mockRun.mockResolvedValue({violations: [{id: "image-alt", help: "Add alternative text", helpUrl: "https://example.test/image-alt", nodes: [{element: section}]}]})
    const reviewer = await createAccessibilityReviewer()
    const before = section.outerHTML
    expect(await reviewer.check(document.body, schemaWith())).toMatchObject([{text: "Read this lesson."}])
    expect(section.outerHTML).toBe(before)
  })

  it("scopes non-body requests and returns no results after disposal, including while axe is pending", async () => {
    const section = document.createElement("section")
    const paragraph = document.createElement("p")
    section.append(paragraph)
    document.body.append(section)
    let resolveRun!: (value: any) => void
    mockRun.mockReturnValue(new Promise(resolve => { resolveRun = resolve }))
    const reviewer = await createAccessibilityReviewer()
    const pending = reviewer.check(section, schemaWith())
    expect(mockRun.mock.calls[0][0]).toBe(section)
    reviewer.dispose()
    resolveRun({violations: [{id: "x", help: "Help", helpUrl: "url", nodes: [{element: paragraph}]}]})
    await expect(pending).resolves.toEqual([])
    await expect(reviewer.check(section, schemaWith())).resolves.toEqual([])
  })

  it("propagates axe failures without leaving editor state behind", async () => {
    mockRun.mockRejectedValue(new Error("axe failed"))
    const reviewer = await createAccessibilityReviewer()
    await expect(reviewer.check(document.body, schemaWith())).rejects.toThrow("axe failed")
    reviewer.dispose()
  })
})
