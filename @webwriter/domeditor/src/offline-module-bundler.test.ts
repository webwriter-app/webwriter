import {describe, expect, it, vi} from "vitest"
import {bundleOfflineModules, packageFileSideEffects, resolveOfflineModule} from "./offline-module-bundler"

vi.mock("esbuild-wasm", async () => ({initialize: vi.fn().mockResolvedValue(undefined), build: (await import("esbuild")).build}))

const base = "https://editor.example/document.html"
const map = {
  imports: {lit: "https://cdn.example/lit-3.js", "assets/": "https://cdn.example/assets/"},
  scopes: {
    "https://cdn.example/widget-old/": {lit: "https://cdn.example/lit-2.js"},
    "https://cdn.example/widget-old/deep/": {lit: "https://cdn.example/lit-1.js"},
  },
}

describe("offline import-map resolution", () => {
  it("shares top-level exact and prefix mappings", () => {
    expect(resolveOfflineModule("lit", "https://cdn.example/widget-new/main.js", map, base)).toBe("https://cdn.example/lit-3.js")
    expect(resolveOfflineModule("assets/icon.svg", "https://cdn.example/widget-new/main.js", map, base)).toBe("https://cdn.example/assets/icon.svg")
  })

  it("uses the most specific scope for incompatible versions", () => {
    expect(resolveOfflineModule("lit", "https://cdn.example/widget-old/main.js", map, base)).toBe("https://cdn.example/lit-2.js")
    expect(resolveOfflineModule("lit", "https://cdn.example/widget-old/deep/main.js", map, base)).toBe("https://cdn.example/lit-1.js")
  })

  it("resolves relative URLs against each importing module and rejects unknown bare names", () => {
    expect(resolveOfflineModule("./helper.js", "https://cdn.example/widget-old/main.js", map, base)).toBe("https://cdn.example/widget-old/helper.js")
    expect(() => resolveOfflineModule("missing", "https://cdn.example/widget-old/main.js", map, base)).toThrow("cannot resolve module")
  })
})

describe("offline import selection", () => {
  it("bundles only selected dynamic imports from the declared importer", async () => {
    const root = "https://cdn.example/widget/"
    const files: Record<string, string> = {
      "/widget/main.js": `import {load} from "./registry.js"; register(load, () => import("./regular.js"));`,
      "/widget/registry.js": `import value from "./shared.js";
        export const load = {one: () => import("./one.js"), two: () => import("./two.js"), shared: () => value};`,
      "/widget/one.js": `import value from "./shared.js"; export default value + 1;`,
      "/widget/regular.js": `export default 4;`,
      "/widget/shared.js": `export default 2;`,
    }
    const fetcher = vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const source = files[new URL(String(input)).pathname]
      return source === undefined ? new Response(null, {status: 404}) : new Response(source)
    })
    try {
      const {js} = await bundleOfflineModules([`${root}main.js`], {}, base, new Map([
        [`${root}registry.js`, new Set(["./one.js"])],
      ]))
      const register = vi.fn()
      new Function("register", js)(register)
      const [load, regular] = register.mock.calls[0]
      expect(load.shared()).toBe(2)
      await expect(load.one()).resolves.toMatchObject({default: 3})
      await expect(load.two()).rejects.toMatchObject({name: "OfflineImportError"})
      await expect(regular()).resolves.toMatchObject({default: 4})
      expect(fetcher).not.toHaveBeenCalledWith(`${root}two.js`)
      expect(fetcher.mock.calls.filter(([url]) => url === `${root}shared.js`)).toHaveLength(1)
    }
    finally { fetcher.mockRestore() }
  })
})

describe("package side effects", () => {
  it("reads false, file patterns and undeclared side effects like bundlers do", () => {
    expect(packageFileSideEffects(false, "debounce.js")).toBe(false)
    expect(packageFileSideEffects(undefined, "index.js")).toBeUndefined()
    expect(packageFileSideEffects(true, "index.js")).toBeUndefined()
    // A pattern without a slash matches the file name in any directory.
    expect(packageFileSideEffects(["*.css"], "dist/themes/light.css")).toBe(true)
    expect(packageFileSideEffects(["*.css"], "dist/index.js")).toBe(false)
    expect(packageFileSideEffects(["./src/polyfill.js"], "src/polyfill.js")).toBe(true)
    expect(packageFileSideEffects(["./src/polyfill.js"], "polyfill.js")).toBe(false)
    expect(packageFileSideEffects(["dist/**/register-*.js"], "dist/a/b/register-button.js")).toBe(true)
    expect(packageFileSideEffects(["dist/**/register-*.js"], "dist/a/button.js")).toBe(false)
    expect(packageFileSideEffects(["dist/component?.js"], "dist/component1.js")).toBe(true)
  })
})
