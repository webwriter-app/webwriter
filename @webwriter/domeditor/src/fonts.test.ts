// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {bunnyFonts, bunnyFontStylesheet, bunnyFontValue, fontWithFallback, syncBunnyFonts, type BunnyFont} from "./fonts"

const font: BunnyFont = {familyName: "Alegreya", category: "serif", weights: [400, 700], styles: ["normal", "italic"]}
const href = bunnyFontStylesheet(font)
afterEach(() => { vi.unstubAllGlobals(); document.head.replaceChildren(); document.body.replaceChildren() })

describe("Bunny Fonts", () => {
  it("retries failed catalog loads and caches the live, alphabetized list", async () => {
    const fetch = vi.fn().mockResolvedValueOnce({ok: false})
      .mockResolvedValueOnce({ok: true, json: async () => ({z: {...font, familyName: "Zilla Slab"}, alegreya: font})})
    vi.stubGlobal("fetch", fetch)
    await expect(bunnyFonts()).rejects.toThrow()
    const [first, second] = await Promise.all([bunnyFonts(), bunnyFonts()])
    expect(first.map(font => font.familyName)).toEqual(["Alegreya", "Zilla Slab"])
    expect(first).toBe(second)
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(fetch).toHaveBeenLastCalledWith("https://fonts.bunny.net/list", {credentials: "omit"})
  })

  it("builds type-matched fallbacks and requests every available weight and style", () => {
    expect(bunnyFontValue(font)).toBe('"Alegreya", serif')
    expect(bunnyFontValue({...font, category: "handwriting"})).toBe('"Alegreya", cursive')
    expect(bunnyFontValue({...font, category: "display"})).toBe('"Alegreya", fantasy')
    expect(bunnyFontValue({...font, category: "monospace"})).toBe('"Alegreya", monospace')
    expect(bunnyFontValue({...font, category: "sans-serif"})).toBe('"Alegreya", sans-serif')
    expect(new URL(href).searchParams.get("family")).toBe("Alegreya:400,400i,700,700i")
    expect(fontWithFallback("Georgia")).toBe("Georgia, serif")
    expect(fontWithFallback('"Courier New"')).toBe('"Courier New", monospace')
    expect(fontWithFallback('"Unknown, quoted font"')).toBe('"Unknown, quoted font", sans-serif')
    expect(fontWithFallback('"Alegreya", serif')).toBe('"Alegreya", serif')
    expect(fontWithFallback("inherit")).toBe("inherit")
  })

  it("counts inline, SVG, widget light DOM, stylesheet and template declarations while preserving unrelated resources", () => {
    document.head.innerHTML = `<link rel="stylesheet" href="${href}"><link rel="stylesheet" href="https://example.com/theme.css">`
    document.body.innerHTML = '<test-widget><span style="font-family: Alegreya, serif">Widget</span></test-widget><svg><text font-family="Alegreya">SVG</text></svg><template><p style="font-family: Alegreya">Later</p></template>'
    const widget = document.querySelector("test-widget")!
    const resources = new Map<string, string>()
    syncBunnyFonts(document, resources)
    widget.firstElementChild!.remove()
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(2)
    document.querySelector("svg")!.remove()
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(2)
    document.querySelector("template")!.remove()
    const style = document.createElement("style")
    style.textContent = ".custom {font-family: Alegreya, serif}"
    document.head.append(style)
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(2)
    style.remove()
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(1)
    expect(document.head.querySelector("link")!.href).toBe("https://example.com/theme.css")
    expect(widget.outerHTML).toBe("<test-widget></test-widget>")
  })

  it("recognizes imported Bunny catalog slugs without dropping a used resource", () => {
    document.head.innerHTML = '<link rel="stylesheet" href="https://fonts.bunny.net/css?family=open-sans:400,700&display=swap">'
    document.body.innerHTML = '<p style="font-family: &quot;Open Sans&quot;, sans-serif">Text</p>'
    const resources = new Map<string, string>()
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(1)
    resources.set("open sans", bunnyFontStylesheet({...font, familyName: "Open Sans"}))
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(1)
    document.querySelector("p")!.remove()
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(0)
    document.body.innerHTML = '<p style="font-family: &quot;Open Sans&quot;, sans-serif">Restored</p>'
    syncBunnyFonts(document, resources)
    expect(document.head.querySelectorAll("link")).toHaveLength(1)
  })
})
