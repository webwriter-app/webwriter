// @vitest-environment happy-dom
import {afterEach, beforeEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "./packages"
import {hasImportMapEntries, npmFileProvider, packageImportMapScript, packageModuleEntries, resolvePackageDependencies} from "./package-dependencies"

type GeneratorOptions = {defaultProvider: string, customProviders: Record<string, ReturnType<typeof npmFileProvider>>, ignore?: string[]}
const generator = vi.hoisted(() => ({
  links: [] as {entries: string[], options: GeneratorOptions}[],
  fails: ((_entries: string[], _options: GeneratorOptions) => false) as (entries: string[], options: GeneratorOptions) => boolean,
}))
vi.mock("@jspm/generator", () => ({
  Generator: class {
    constructor(private options: GeneratorOptions) {}
    private entries: string[] = []
    async link(entries: string[]) {
      generator.links.push({entries, options: this.options})
      if(generator.fails(entries, this.options)) throw new Error("Link failed")
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
})
afterEach(() => { vi.unstubAllGlobals() })

describe("package dependency resolution", () => {
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
