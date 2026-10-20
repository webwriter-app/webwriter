// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "./packages"
import {hasImportMapEntries, loadDocumentPackages, npmFileProvider, packageImportMapScript, packageModuleEntries, resolvePackageDependencies} from "./package-dependencies"
import {NPM_FILE_TIMEOUT_MS} from "./npm-files"

type GeneratorOptions = {defaultProvider: string, customProviders: Record<string, ReturnType<typeof npmFileProvider>>, ignore?: string[]}
const generator = vi.hoisted(() => ({
  links: [] as {entries: string[], options: GeneratorOptions}[],
  fails: ((_entries: string[], _options: GeneratorOptions) => false) as (entries: string[], options: GeneratorOptions) => boolean,
  resolveLatestTarget: undefined as ((provider: GeneratorOptions["customProviders"]["webwriter-npm"]) => Promise<void>) | undefined,
}))
vi.mock("@jspm/generator", () => ({
  Generator: class {
    constructor(private options: GeneratorOptions) {}
    private entries: string[] = []
    async link(entries: string[]) {
      generator.links.push({entries, options: this.options})
      if(generator.fails(entries, this.options)) throw new Error("Link failed")
      await generator.resolveLatestTarget?.(this.options.customProviders[this.options.defaultProvider])
      this.entries = entries
    }
    getMap() {
      const host = this.options.customProviders[this.options.defaultProvider].pkgToUrl({name: "lit", version: "3.3.3"})
      return {
        imports: {lit: `${host}index.js`},
        scopes: {"./widgets/": {lit: `${host}index.js`}},
      }
    }
  },
}))

const widgetPackage = (name: string, entry: string): WebWriterPackage => ({
  name, version: "1.0.0", label: name, authors: [], keywords: [], links: {}, members: [],
  scripts: [entry], styles: [],
  manifest: {name, version: "1.0.0"},
})

beforeEach(() => {
  generator.links = []
  generator.fails = () => false
  generator.resolveLatestTarget = undefined
})
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe("package dependency resolution", () => {
  const documentWith = (html: string) => new DOMParser().parseFromString(html, "text/html")
  const resolvedPackage = (name: string, version: string, scripts: string[]): WebWriterPackage => ({
    name, version, label: name, authors: [], keywords: [], links: {}, members: [], scripts, styles: [],
    manifest: {name, version},
  })

  it("loads unique exact WebWriter package refs and preserves their authored script order", async () => {
    const source = documentWith(`<script type="module" src="https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/second.js"></script>
      <script type="module" src="https://unpkg.com/@webwriter/demo@1.2.3/dist/first.js"></script>
      <script type="module" src="https://cdn.jsdelivr.net/npm/@webwriter/demo@latest/dist/no.js"></script>
      <script type="module" src="https://cdn.jsdelivr.net/npm/lit@3.3.3/index.js"></script>
      <script type="module" src="https://example.test/@webwriter/other@2.0.0/index.js"></script>
      <template><script type="module" src="https://cdn.jsdelivr.net/npm/@webwriter/nested@2.0.0/index.js"></script></template>`)
    const getPackage = vi.fn(async({name, version}: {name: string, version: string}) => resolvedPackage(name, version,
      name.endsWith("demo") ? [
        "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/first.js",
        "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/second.js",
        "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/unused.js",
      ] : ["https://cdn.jsdelivr.net/npm/@webwriter/nested@2.0.0/index.js"]))

    const packages = await loadDocumentPackages(source, {getPackage} as never)
    expect(getPackage.mock.calls.map(([ref]) => ref)).toEqual([
      {name: "@webwriter/demo", version: "1.2.3"},
      {name: "@webwriter/nested", version: "2.0.0"},
    ])
    expect(packages[0].scripts).toEqual([
      "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/second.js",
      "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/first.js",
      "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/dist/unused.js",
    ])
  })

  it("restores offline bundle entries on a clone without changing the source", async () => {
    const source = documentWith(`<script type="module" src="data:text/javascript;base64,ZXhwb3J0IHt9"></script>`)
    source.querySelector("script")!.setAttribute("data-webwriter-original-package-entries", JSON.stringify([
      "https://cdn.jsdelivr.net/npm/@webwriter/offline@4.5.6/index.js",
    ]))
    const getPackage = vi.fn(async({name, version}: {name: string, version: string}) => resolvedPackage(name, version, []))
    await expect(loadDocumentPackages(source, {getPackage} as never)).resolves.toHaveLength(1)
    expect(getPackage).toHaveBeenCalledWith({name: "@webwriter/offline", version: "4.5.6"})
    expect(source.querySelector("script")?.getAttribute("src")).toBe("data:text/javascript;base64,ZXhwb3J0IHt9")
    expect(source.querySelector("script")?.hasAttribute("data-webwriter-original-package-entries")).toBe(true)
  })

  it("reuses an installed exact version and propagates lookup failures", async () => {
    const entry = "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/index.js"
    const source = documentWith(`<script type="module" src="${entry}"></script>`)
    const installed = resolvedPackage("@webwriter/demo", "1.2.3", [entry])
    const getPackage = vi.fn()
    await expect(loadDocumentPackages(source, {getPackage} as never, [installed])).resolves.toEqual([installed])
    expect(getPackage).not.toHaveBeenCalled()
    await expect(loadDocumentPackages(source, {getPackage: vi.fn().mockRejectedValue(new Error("missing"))} as never))
      .rejects.toThrow("missing")
  })

  it("fetches the full package when an installed preview lacks an authored export", async () => {
    const referenced = "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/other.js"
    const source = documentWith(`<script type="module" src="${referenced}"></script>`)
    const installed = resolvedPackage("@webwriter/demo", "1.2.3", [
      "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/preview.js",
    ])
    const fullPackage = resolvedPackage("@webwriter/demo", "1.2.3", [referenced, "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/preview.js"])
    const getPackage = vi.fn(async() => fullPackage)
    await expect(loadDocumentPackages(source, {getPackage} as never, [installed])).resolves.toEqual([fullPackage])
    expect(getPackage).toHaveBeenCalledWith({name: "@webwriter/demo", version: "1.2.3"})
  })

  it("rejects conflicting exact versions of the same package", async () => {
    const source = documentWith(`<script type="module" src="https://cdn.jsdelivr.net/npm/@webwriter/demo@1.2.3/index.js"></script>
      <script type="module" src="https://cdn.jsdelivr.net/npm/@webwriter/demo@2.0.0/index.js"></script>`)
    await expect(loadDocumentPackages(source, {getPackage: vi.fn()} as never))
      .rejects.toThrow("conflicting versions of @webwriter/demo")
  })

  it("links every widget script, fully bundled ones included, as one graph with portable absolute mappings", async () => {
    const entries = ["https://cdn.example/a.js", "https://cdn.example/b.js", "https://cdn.example/legacy.js"]
    expect(packageModuleEntries([])).toEqual([])
    const plan = await resolvePackageDependencies(entries.map((entry, i) => widgetPackage(`@webwriter/p${i}`, entry)), "https://editor.example/document.html")
    expect(generator.links).toHaveLength(1)
    expect(generator.links[0].entries).toEqual(entries)
    // Node built-ins are not traced, so the generator never installs jspm.io polyfills for them.
    expect(generator.links[0].options.ignore).toEqual(expect.arrayContaining(["process", "node:fs", "fs/promises"]))
    expect(plan.map).toEqual({
      imports: {lit: "https://cdn.jsdelivr.net/npm/lit@3.3.3/index.js"},
      scopes: {"https://editor.example/widgets/": {lit: "https://cdn.jsdelivr.net/npm/lit@3.3.3/index.js"}},
    })
  })

  it("resolves versions from jsDelivr, or else the npm registry, never from jspm.io", async () => {
    const requests: string[] = []
    vi.stubGlobal("fetch", vi.fn(async(url: string) => {
      requests.push(url)
      if(url === "https://data.jsdelivr.com/v1/packages/npm/lit") return Response.json({versions: [{version: "3.3.3"}, {version: "2.8.0"}]})
      if(url.startsWith("https://data.jsdelivr.com/")) return new Response(null, {status: 503})
      if(url === "https://registry.npmjs.org/@lit%2freactive-element") return Response.json({versions: {"2.1.2": {}, "1.6.3": {}}})
      return new Response(null, {status: 404})
    }))
    const provider = npmFileProvider("https://cdn.jsdelivr.net/npm")
    const range = (major: string) => ({bestMatch: (versions: string[]) => versions.find(version => version.startsWith(major)) ?? null})
    await expect(provider.resolveLatestTarget({registry: "npm", name: "lit", range: range("3."), unstable: false}, "default"))
      .resolves.toEqual({registry: "npm", name: "lit", version: "3.3.3"})
    await expect(provider.resolveLatestTarget({registry: "npm", name: "@lit/reactive-element", range: range("2."), unstable: false}, "default"))
      .resolves.toEqual({registry: "npm", name: "@lit/reactive-element", version: "2.1.2"})
    expect(requests.some(url => url.includes("jspm.io"))).toBe(false)
    expect(provider.pkgToUrl({name: "@lit/reactive-element", version: "2.1.2"})).toBe("https://cdn.jsdelivr.net/npm/@lit/reactive-element@2.1.2/")
    expect(provider.parseUrlPkg("https://cdn.jsdelivr.net/npm/@lit/reactive-element@2.1.2/css-tag.js"))
      .toEqual({registry: "npm", name: "@lit/reactive-element", version: "2.1.2"})
    expect(provider.parseUrlPkg("https://unpkg.com/lit@3.3.3/index.js")).toBeUndefined()
  })

  it("refreshes published version metadata between dependency resolution passes", async () => {
    const requests: string[] = []
    let catalogFetch = 0
    vi.stubGlobal("fetch", vi.fn(async(url: string) => {
      requests.push(url)
      if(url === "https://data.jsdelivr.com/v1/packages/npm/lit") {
        catalogFetch++
        return Response.json({versions: catalogFetch === 1 ? ["3.3.3"] : ["3.4.0", "3.3.3"]})
      }
      return new Response(null, {status: 404})
    }))
    const resolvedVersions: string[] = []
    generator.resolveLatestTarget = async provider => {
      const result = await provider.resolveLatestTarget({registry: "npm", name: "lit", range: {
        bestMatch: (versions: string[]) => versions[0] ? {toString: () => versions[0]} : null,
      }, unstable: false}, "default")
      resolvedVersions.push(result.version)
    }
    const packages = [widgetPackage("@webwriter/demo", "https://cdn.jsdelivr.net/npm/@webwriter/demo@1.0.0/index.js")]
    await resolvePackageDependencies(packages, "https://editor.example/")
    await resolvePackageDependencies(packages, "https://editor.example/")
    expect(resolvedVersions).toEqual(["3.3.3", "3.4.0"])
    expect(requests.filter(url => url === "https://data.jsdelivr.com/v1/packages/npm/lit")).toHaveLength(2)
  })

  it("links on a mirror when jsDelivr is unreachable and maps the result back to jsDelivr", async () => {
    const provider = (options: GeneratorOptions) => options.customProviders[options.defaultProvider].pkgToUrl({name: "x", version: "1"})
    generator.fails = (_entries, options) => provider(options).startsWith("https://cdn.jsdelivr.net/")
    vi.stubGlobal("fetch", vi.fn(async(url: string) => {
      if(url.startsWith("https://cdn.jsdelivr.net/")) throw new TypeError("Failed to fetch")
      return new Response("{}")
    }))
    const entry = "https://cdn.jsdelivr.net/npm/@webwriter/a@1.0.0/dist/a.js"
    const plan = await resolvePackageDependencies([widgetPackage("@webwriter/a", entry)], "https://editor.example/")
    expect(generator.links.at(-1)!.entries).toEqual(["https://unpkg.com/@webwriter/a@1.0.0/dist/a.js"])
    expect(provider(generator.links.at(-1)!.options)).toBe("https://unpkg.com/x@1/")
    expect(plan.map?.imports?.lit).toBe("https://cdn.jsdelivr.net/npm/lit@3.3.3/index.js")
  })

  it("falls back to the registry when version metadata stalls and bounds a stalled registry too", async () => {
    vi.useFakeTimers()
    const fetcher = vi.fn(async(url: string, init: RequestInit = {}) => {
      if(url.startsWith("https://registry.npmjs.org/") && url.endsWith("version-timeout-fallback")) {
        return Response.json({versions: {"1.0.0": {}}})
      }
      return await new Promise<Response>((_, reject) => init.signal!.addEventListener("abort", () => reject(init.signal!.reason), {once: true}))
    })
    vi.stubGlobal("fetch", fetcher)
    const provider = npmFileProvider("https://cdn.jsdelivr.net/npm")
    const target = (name: string) => ({registry: "npm", name, range: {bestMatch: (versions: string[]) => versions[0] ?? null}, unstable: false})
    const fallback = provider.resolveLatestTarget(target("version-timeout-fallback"), "default")
    await vi.advanceTimersByTimeAsync(NPM_FILE_TIMEOUT_MS)
    await expect(fallback).resolves.toMatchObject({version: "1.0.0"})

    const stalled = provider.resolveLatestTarget(target("version-timeout-both"), "default")
    const rejected = expect(stalled).rejects.toMatchObject({name: "TimeoutError"})
    await vi.advanceTimersByTimeAsync(NPM_FILE_TIMEOUT_MS * 2)
    await rejected
    expect(fetcher).toHaveBeenCalledTimes(4)
  })

  it("leaves out a script that cannot be linked instead of blocking the other widgets", async () => {
    const broken = "https://cdn.example/broken.js"
    generator.fails = entries => entries.includes(broken)
    vi.stubGlobal("fetch", vi.fn(async() => new Response("{}")))
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {})
    const plan = await resolvePackageDependencies([
      widgetPackage("@webwriter/a", "https://cdn.example/a.js"),
      widgetPackage("@webwriter/broken", broken),
    ], "https://editor.example/")
    expect(plan.entries).toEqual(["https://cdn.example/a.js", broken])
    expect(generator.links.at(-1)!.entries).toEqual(["https://cdn.example/a.js"])
    expect(hasImportMapEntries(plan.map)).toBe(true)
    expect(warning).toHaveBeenCalledWith(expect.stringContaining(broken), expect.any(Error))
    warning.mockRestore()
  })

  it("escapes markup delimiters in generated inline import maps", () => {
    const script = packageImportMapScript(document, {imports: {danger: "https://example.test/</script>.js"}})
    expect(script.textContent).not.toContain("</script>")
    expect(JSON.parse(script.textContent!)).toEqual({imports: {danger: "https://example.test/</script>.js"}})
  })
})
