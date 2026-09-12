// @vitest-environment happy-dom
import {describe, expect, it, vi} from "vitest"
import {
  JSDELIVR_PACKAGE_FILES_ENDPOINT,
  NPM_SEARCH_ENDPOINT,
  PACKAGE_DOCUMENTATION_MAX_BYTES,
  PACKAGE_DOCUMENTATION_MAX_CHARS,
  PACKAGE_DOCUMENTATION_MAX_LINES,
  WebWriterPackageRegistry,
  describePackageExport,
  packageCdnUrl,
  packageInsertionItems,
  packageWidgetSchemaDefinitions,
  sanitizePackageSnippet,
  webWriterPackageExportName,
  withPackageExportSource,
} from "./packages"

describe("WebWriterPackageRegistry", () => {
  it("reads and paginates an exact-version registry README through the cache", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe("https://registry.npmjs.org/%40webwriter%2Fdocs/1.0.0")
      return Response.json({name: "@webwriter/docs", version: "1.0.0", readme: "one\ntwo\nthree", readmeFilename: "README.md"})
    })
    const registry = new WebWriterPackageRegistry(fetcher as typeof fetch)

    await expect(registry.readPackageReadme({name: "@webwriter/docs", version: "1.0.0"}, {startLine: 2, lineCount: 1}))
      .resolves.toEqual(expect.objectContaining({
        source: "published",
        packageName: "@webwriter/docs",
        version: "1.0.0",
        status: "available",
        path: "README.md",
        markdown: "two",
        startLine: 2,
        endLine: 2,
        totalLines: 3,
      }))
    await expect(registry.readPackageReadme({name: "@webwriter/docs", version: "1.0.0"}, {startLine: 3}))
      .resolves.toMatchObject({markdown: "three", startLine: 3, endLine: 3})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("finds case variants from the pinned package file listing", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if(url === "https://registry.npmjs.org/%40webwriter%2Fdocs/1.0.1") {
        return Response.json({name: "@webwriter/docs", version: "1.0.1"})
      }
      if(url === "https://data.jsdelivr.com/v1/package/npm/@webwriter/docs@1.0.1/flat") {
        return Response.json({files: [{name: "/readme.md"}]})
      }
      if(url === "https://cdn.jsdelivr.net/npm/@webwriter/docs@1.0.1/readme.md") return new Response("# Docs\ncontent")
      throw new Error(`Unexpected request: ${url}`)
    })

    await expect(new WebWriterPackageRegistry(fetcher as typeof fetch).readPackageReadme({name: "@webwriter/docs", version: "1.0.1"}))
      .resolves.toMatchObject({status: "available", path: "readme.md", markdown: "# Docs\ncontent"})
  })

  it("returns an explicit unavailable result and retries transient failures", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response("busy", {status: 503}))
      .mockResolvedValueOnce(Response.json({readme: "ready"}))
    const registry = new WebWriterPackageRegistry(fetcher as typeof fetch)
    const reference = {name: "@webwriter/retry", version: "1.0.0"}

    await expect(registry.readPackageReadme(reference)).resolves.toMatchObject({status: "unavailable", reason: "fetch-failed"})
    await expect(registry.readPackageReadme(reference)).resolves.toMatchObject({status: "available", markdown: "ready"})
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it("caps README excerpts at the documented line limit", async () => {
    const lines = Array.from({length: PACKAGE_DOCUMENTATION_MAX_LINES + 1}, (_, index) => String(index + 1)).join("\n")
    const fetcher = vi.fn(async () => Response.json({readme: lines}))
    const result = await new WebWriterPackageRegistry(fetcher as typeof fetch)
      .readPackageReadme({name: "@webwriter/lines", version: "1.0.0"})
    expect(result).toMatchObject({status: "available", startLine: 1, endLine: PACKAGE_DOCUMENTATION_MAX_LINES, nextStartLine: PACKAGE_DOCUMENTATION_MAX_LINES + 1})
    if(result.status === "available") expect(result.markdown.split("\n")).toHaveLength(PACKAGE_DOCUMENTATION_MAX_LINES)
  })

  it("rejects oversized documentation with an explicit result", async () => {
    const fetcher = vi.fn(async () => Response.json({readme: "x".repeat(PACKAGE_DOCUMENTATION_MAX_BYTES)}))
    await expect(new WebWriterPackageRegistry(fetcher as typeof fetch)
      .readPackageReadme({name: "@webwriter/large", version: "1.0.0"}))
      .resolves.toMatchObject({status: "unavailable", reason: "too-large"})
  })

  it("passes cancellation to published documentation fetches", async () => {
    const controller = new AbortController()
    const fetcher = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      expect(init?.signal).toBe(controller.signal)
      await new Promise<void>(resolve => controller.signal.addEventListener("abort", () => resolve(), {once: true}))
      throw controller.signal.reason
    })
    const request = new WebWriterPackageRegistry(fetcher as typeof fetch)
      .readPackageReadme({name: "@webwriter/abort", version: "1.0.0"}, {signal: controller.signal})
    controller.abort()
    await expect(request).rejects.toMatchObject({name: "AbortError"})
  })

  it("checks cancellation even when an exact-version README is cached", async () => {
    const fetcher = vi.fn(async () => Response.json({readme: "cached"}))
    const registry = new WebWriterPackageRegistry(fetcher as typeof fetch)
    const reference = {name: "@webwriter/cached", version: "1.0.0"}
    await expect(registry.readPackageReadme(reference)).resolves.toMatchObject({status: "available"})
    const controller = new AbortController()
    controller.abort()
    await expect(registry.readPackageReadme(reference, {signal: controller.signal})).rejects.toMatchObject({name: "AbortError"})
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it("rejects an excerpt containing one excessively long line", async () => {
    const fetcher = vi.fn(async () => Response.json({readme: "x".repeat(PACKAGE_DOCUMENTATION_MAX_CHARS + 1)}))
    await expect(new WebWriterPackageRegistry(fetcher as typeof fetch)
      .readPackageReadme({name: "@webwriter/long-line", version: "1.0.0"}))
      .resolves.toMatchObject({status: "unavailable", reason: "too-large", message: expect.stringContaining("character")})
  })

  it("validates pagination values", async () => {
    const fetcher = vi.fn(async () => Response.json({readme: "one\ntwo"}))
    const registry = new WebWriterPackageRegistry(fetcher as typeof fetch)
    const reference = {name: "@webwriter/range", version: "1.0.0"}
    await expect(registry.readPackageReadme(reference, {lineCount: 0})).rejects.toThrow("lineCount")
    await expect(registry.readPackageReadme(reference, {startLine: 3})).rejects.toThrow("startLine")
  })

  it("omits inferred CSS only when the jsDelivr listing confirms it is absent", async () => {
    const manifest = {
      name: "@webwriter/chemdraw",
      version: "2.1.1",
      exports: {
        "./widgets/webwriter-periodic-table.*": "./dist/widgets/webwriter-periodic-table.*",
      },
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if(url === "https://registry.npmjs.org/%40webwriter%2Fchemdraw/2.1.1") return Response.json(manifest)
      if(url.startsWith(JSDELIVR_PACKAGE_FILES_ENDPOINT)) {
        return Response.json({default: null, files: [
          {name: "/dist/widgets/webwriter-periodic-table.js"},
        ]})
      }
      throw new Error("Unexpected request: " + url)
    })

    const pkg = await new WebWriterPackageRegistry(fetcher as typeof fetch).getPackage(manifest)

    expect(fetcher).toHaveBeenCalledWith("https://data.jsdelivr.com/v1/package/npm/@webwriter/chemdraw@2.1.1/flat")
    expect(pkg.scripts).toEqual(["https://cdn.jsdelivr.net/npm/@webwriter/chemdraw@2.1.1/dist/widgets/webwriter-periodic-table.js"])
    expect(pkg.styles).toEqual([])
  })

  it("filters only the missing inferred CSS while retaining other widget assets", async () => {
    const manifest = {
      name: "@webwriter/branching-scenario",
      version: "1.2.1",
      exports: {
        "./widgets/webwriter-branching-scenario.*": "./dist/widgets/webwriter-branching-scenario.*",
        "./widgets/webwriter-gamebook-branch.*": "./dist/widgets/webwriter-gamebook-branch.*",
      },
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if(url === "https://registry.npmjs.org/%40webwriter%2Fbranching-scenario/1.2.1") return Response.json(manifest)
      if(url.startsWith(JSDELIVR_PACKAGE_FILES_ENDPOINT)) {
        return Response.json({files: [
          {name: "/dist/widgets/webwriter-branching-scenario.js"},
          {name: "/dist/widgets/webwriter-branching-scenario.css"},
          {name: "/dist/widgets/webwriter-gamebook-branch.js"},
        ]})
      }
      throw new Error("Unexpected request: " + url)
    })

    const pkg = await new WebWriterPackageRegistry(fetcher as typeof fetch).getPackage(manifest)

    expect(pkg.scripts).toEqual([
      "https://cdn.jsdelivr.net/npm/@webwriter/branching-scenario@1.2.1/dist/widgets/webwriter-branching-scenario.js",
      "https://cdn.jsdelivr.net/npm/@webwriter/branching-scenario@1.2.1/dist/widgets/webwriter-gamebook-branch.js",
    ])
    expect(pkg.styles).toEqual([
      "https://cdn.jsdelivr.net/npm/@webwriter/branching-scenario@1.2.1/dist/widgets/webwriter-branching-scenario.css",
    ])
  })

  it("keeps inferred CSS when the jsDelivr listing is unavailable", async () => {
    const manifest = {
      name: "@webwriter/branching-scenario",
      version: "1.2.1",
      exports: {
        "./widgets/webwriter-gamebook-branch.*": "./dist/widgets/webwriter-gamebook-branch.*",
      },
    }
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input)
      if(url === "https://registry.npmjs.org/%40webwriter%2Fbranching-scenario/1.2.1") return Response.json(manifest)
      if(url.startsWith(JSDELIVR_PACKAGE_FILES_ENDPOINT)) return new Response(null, {status: 503})
      throw new Error("Unexpected request: " + url)
    })

    const pkg = await new WebWriterPackageRegistry(fetcher as typeof fetch).getPackage(manifest)

    expect(pkg.styles).toEqual([
      "https://cdn.jsdelivr.net/npm/@webwriter/branching-scenario@1.2.1/dist/widgets/webwriter-gamebook-branch.css",
    ])
  })

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
    expect(pkg.manifest?.editingConfig).toEqual({".": {label: {de: "Demo-Paket"}}})
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

describe("package export editing", () => {
  it("maps documented export keys to editable type, name, and source fields", () => {
    expect(describePackageExport("./widgets/demo.*", {source: "./src/demo.ts", default: "./dist/demo.*"}))
      .toEqual({type: "widget", name: "demo", source: "./src/demo.ts"})
    expect(describePackageExport("./themes/course.html", "./src/course.css"))
      .toEqual({type: "theme", name: "course", source: "./src/course.css"})
    expect(describePackageExport("./custom-elements.json", "./custom-elements.json"))
      .toEqual({type: "custom-elements", name: "custom-elements", source: "./custom-elements.json"})
  })

  it("builds typed names and preserves conditional targets when the source changes", () => {
    expect(webWriterPackageExportName("snippet", "example")).toBe("./snippets/example.html")
    expect(webWriterPackageExportName("icon", "ignored")).toBe("./icon")
    expect(withPackageExportSource(
      {source: "./src/old.ts", default: "./dist/demo.*"},
      "./src/new.ts",
    )).toEqual({source: "./src/new.ts", default: "./dist/demo.*"})
  })
})
