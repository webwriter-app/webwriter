import {describe, expect, it} from "vitest"
import {packageFileSideEffects, resolveOfflineModule} from "./offline-module-bundler"

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
