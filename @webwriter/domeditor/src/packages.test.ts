// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {
  NPM_SEARCH_ENDPOINT,
  WebWriterPackageRegistry,
  packageCdnUrl,
  packageInsertionItems,
  packageWidgetSchemaDefinitions,
  sanitizePackageSnippet,
} from "./packages"

describe("WebWriterPackageRegistry", () => {
  it("discovers scoped packages and preserves ordered widget/snippet exports", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if(url.startsWith(NPM_SEARCH_ENDPOINT)) {
        const query = new URL(url)
        expect(query.searchParams.get("text")).toContain("scope:webwriter")
        expect(query.searchParams.get("size")).toBe("250")
        return Response.json({objects: [{package: {
          name: "@webwriter/demo",
          version: "1.2.3",
          description: "Search description",
          keywords: ["webwriter-widget", "widget-practical"],
          publisher: {username: "publisher"},
          license: "MIT",
          links: {npm: "https://www.npmjs.com/package/@webwriter/demo"},
        }}]})
      }
      if(url === "https://registry.npmjs.org/%40webwriter%2Fdemo/1.2.3") {
        return Response.json({
          name: "@webwriter/demo",
          version: "1.2.3",
          description: "Manifest description",
          keywords: ["webwriter-widget", "widget-practical"],
          author: {name: "Ada Author"},
          license: "Apache-2.0",
          exports: {
            "./icon": "./icon.svg",
            "./editing-config.json": "./editing-config.json",
            "./widgets/webwriter-demo.*": {source: "./src/demo.ts", default: "./dist/demo.*"},
            "./snippets/example.html": "./snippets/example.html",
          },
          editingConfig: {
            ".": {label: {de: "Demo-Paket"}},
          },
        })
      }
      if(url === "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/editing-config.json") {
        return Response.json({
          ".": {label: {_: "Demo Package"}, description: {de: "Detaillierte Beschreibung"}},
          "./widgets/webwriter-demo": {label: {_: "Demo Widget"}, content: "(p | flow)+", isolating: false},
          "./snippets/example": {label: {_: "Example Snippet"}},
        })
      }
      throw new Error(`Unexpected request: ${url}`)
    })

    const registry = new WebWriterPackageRegistry(fetcher as typeof fetch, "de-DE")
    const [pkg] = await registry.search()

    expect(pkg).toMatchObject({
      name: "@webwriter/demo",
      version: "1.2.3",
      label: "Demo-Paket",
      description: "Detaillierte Beschreibung",
      iconUrl: "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/icon.svg",
      authors: ["Ada Author"],
      license: "Apache-2.0",
    })
    expect(pkg.members.map(member => [member.kind, member.label])).toEqual([
      ["widget", "Demo Widget"],
      ["snippet", "Example Snippet"],
    ])
    expect(pkg.scripts).toEqual(["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.js"])
    expect(pkg.editingConfig?.["./widgets/webwriter-demo"]).toMatchObject({
      content: "(p | flow)+",
      isolating: false,
    })
    expect(pkg.members[0].editingConfig).toBe(pkg.editingConfig?.["./widgets/webwriter-demo"])
    expect(packageWidgetSchemaDefinitions([pkg])).toEqual([{
      tagName: "webwriter-demo",
      editingConfig: expect.objectContaining({content: "(p | flow)+", isolating: false}),
    }])
    expect(pkg.styles).toEqual(["https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/demo.css"])
    expect(packageInsertionItems([pkg])).toEqual([
      expect.objectContaining({section: "Packages", kind: "widget", tag: "webwriter-demo"}),
      expect.objectContaining({section: "Packages", kind: "snippet", htmlUrl: "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/snippets/example.html"}),
    ])
  })

  it("pins scoped package assets to their selected versions", () => {
    expect(packageCdnUrl("@webwriter/demo", "2.0.1", "./dist/widget.js"))
      .toBe("https://cdn.jsdelivr.net/npm/@webwriter/demo@2.0.1/dist/widget.js")
    expect(() => packageCdnUrl("@webwriter/demo", "2.0.1", "../../outside.js")).toThrow()
    expect(() => packageCdnUrl("@webwriter/demo", "2.0.1", "./dist/../outside.js")).toThrow()
  })

  it("removes active content from package snippets before insertion", () => {
    const result = sanitizePackageSnippet('<style>body{display:none}</style><link rel="stylesheet"><p onclick="alert(1)" style="color: red">Safe</p><script>alert(2)</script><a href="javascript:alert(3)" srcdoc="<script>evil()</script>" style="background:url(javascript:evil())">link</a><img src="data:image/svg+xml,<svg onload=evil()>" alt="image"><template><script>later()</script><style>p{display:none}</style><span onmouseover="later()">template</span></template>')
    expect(result).toBe('<p style="color: red">Safe</p><a>link</a><img alt="image"><template><span>template</span></template>')
    expect(() => sanitizePackageSnippet("x".repeat(10), 5)).toThrow("too large")
  })
})
