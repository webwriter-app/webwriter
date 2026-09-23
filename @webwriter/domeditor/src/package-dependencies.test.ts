// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "./packages"
import {packageImportMapScript, packageModuleEntries, resolvePackageDependencies} from "./package-dependencies"

const linked = vi.hoisted(() => ({entries: [] as string[]}))
vi.mock("@jspm/generator", () => ({
  Generator: class {
    async link(entries: string[]) { linked.entries = entries }
    getMap() {
      return {
        imports: {lit: "./vendor/lit.js"},
        scopes: {"./widgets/": {lit: "./vendor/lit.js"}},
      }
    }
  },
}))

const widgetPackage = (name: string, entry: string, esm: boolean): WebWriterPackage => ({
  name, version: "1.0.0", label: name, authors: [], keywords: [], links: {}, members: [],
  scripts: [entry], styles: [],
  manifest: {name, version: "1.0.0", ...(esm ? {webwriter: {moduleResolution: "import-map" as const}} : {})},
})

beforeEach(() => { linked.entries = [] })

describe("package dependency resolution", () => {
  it("keeps legacy bundles off the JSPM path", async () => {
    const packages = [widgetPackage("@webwriter/legacy", "https://cdn.example/legacy.js", false)]
    expect(packageModuleEntries(packages)).toEqual([])
    expect(await resolvePackageDependencies(packages, "https://editor.example/document.html")).toEqual({entries: [], map: null})
    expect(linked.entries).toEqual([])
  })

  it("links all opt-in entries together and produces portable absolute mappings", async () => {
    const entries = ["https://cdn.example/a.js", "https://cdn.example/b.js"]
    const plan = await resolvePackageDependencies([
      widgetPackage("@webwriter/a", entries[0], true),
      widgetPackage("@webwriter/b", entries[1], true),
      widgetPackage("@webwriter/legacy", "https://cdn.example/legacy.js", false),
    ], "https://editor.example/document.html")
    expect(linked.entries).toEqual(entries)
    expect(plan.map).toEqual({
      imports: {lit: "https://editor.example/vendor/lit.js"},
      scopes: {"https://editor.example/widgets/": {lit: "https://editor.example/vendor/lit.js"}},
    })
  })

  it("escapes markup delimiters in generated inline import maps", () => {
    const script = packageImportMapScript(document, {imports: {danger: "https://example.test/</script>.js"}})
    expect(script.textContent).not.toContain("</script>")
    expect(JSON.parse(script.textContent!)).toEqual({imports: {danger: "https://example.test/</script>.js"}})
  })
})
