// @vitest-environment happy-dom
import {readFile} from "node:fs/promises"
import {describe, expect, it, vi} from "vitest"
import {base64DataURL, cssFontString, embeddedFontRules, embedFontFiles, fontCSSDataURL, mergeEmbeddedFonts} from "./local-fonts"

const fontPaths = [
  "../../../node_modules/temml/dist/Temml.woff2",
  "../../../node_modules/@wagnerflo/cc-icons/fonts/cc-icons.woff",
  "../../../node_modules/@wagnerflo/cc-icons/fonts/cc-icons.ttf",
  "../../../node_modules/@wagnerflo/cc-icons/fonts/cc-icons.otf",
]

async function fontFiles() {
  return Promise.all(fontPaths.map(async path => new Blob([await readFile(new URL(path, import.meta.url))])))
}

function decodeStylesheet(href: string) {
  return new TextDecoder().decode(Uint8Array.from(atob(href.slice(href.indexOf(",") + 1)), char => char.charCodeAt(0)))
}

describe("local font embedding", () => {
  it("parses installed WOFF2, WOFF, TTF and OTF fonts and embeds each file's bytes", async() => {
    const files = await fontFiles()
    for(let index = 0; index < files.length; index++) {
      const embedded = await embedFontFiles([files[index]])
      expect(embedded.family.trim()).not.toBe("")
      expect(embedded.value).toContain(JSON.stringify(embedded.family))
      expect(embedded.value).toMatch(/, (serif|sans-serif|monospace|cursive|fantasy)$/)
      expect(embedded.stylesheet).toMatch(/^data:text\/css;base64,/)
      const css = decodeStylesheet(embedded.stylesheet)
      const format = ["woff2", "woff", "otf", "otf"][index]
      expect(css).toContain(`data:font/${format};base64,`)
      expect(css).toContain(base64DataURL(new Uint8Array(await files[index].arrayBuffer()), `font/${format}`))
      const rule = embeddedFontRules(embedded.stylesheet)?.[0]
      expect(rule?.style.fontFamily?.replace(/^"|"$/g, "")).toBe(embedded.family)
      expect(rule?.style.fontWeight).toMatch(/^(\d+|\d+ \d+)$/)
      expect(rule?.style.fontStyle).toMatch(/^(normal|italic)$/)
    }
  })

  it("uses font metadata for its family, generic fallback and weight", async() => {
    const [temml] = await fontFiles()
    const embedded = await embedFontFiles([temml], "Custom <Family>")
    expect(embedded.family).toBe("Custom <Family>")
    expect(embedded.value).toContain(cssFontString(embedded.family))
    expect(embedded.value).toMatch(/, (serif|sans-serif|monospace|cursive|fantasy)$/)
    const css = decodeStylesheet(embedded.stylesheet)
    expect(css).toContain(`font-family: ${JSON.stringify(embedded.family).replace("<", "\\3c ")};`)
    expect(css).toMatch(/font-weight: (\d+|\d+ \d+);/)
  })

  it("rejects invalid font data and empty selections", async() => {
    await expect(embedFontFiles([])).rejects.toThrow("No font files selected")
    await expect(embedFontFiles([new Blob(["not a font"])]))
      .rejects.toThrow("This file is not a supported font")
  })

  it("rejects font collections", async() => {
    vi.doMock("fontkitten", () => ({create: () => ({isCollection: true})}))
    try {
      const {embedFontFiles: embedMockedFont} = await import("./local-fonts")
      await expect(embedMockedFont([new Blob(["font collection"])]))
        .rejects.toThrow("Choose an individual font file")
    }
    finally {
      vi.doUnmock("fontkitten")
    }
  })

  it("accepts only CSS containing embedded font-face sources", async() => {
    const [font] = await fontFiles()
    const {stylesheet} = await embedFontFiles([font])
    expect(embeddedFontRules(stylesheet)).toHaveLength(1)
    expect(embeddedFontRules("https://example.test/fonts.css")).toBeNull()
    expect(embeddedFontRules(fontCSSDataURL("body { color: red }"))).toBeNull()
    expect(embeddedFontRules(fontCSSDataURL('@font-face {font-family: "Example"; src: url("https://example.test/font.woff2")}'))).toBeNull()
    expect(embeddedFontRules(fontCSSDataURL('@font-face {font-family: "Example"; src: local("Example")}'))).toBeNull()
  })

  it("merges distinct weight and style faces, replacing a matching face", async() => {
    const [font] = await fontFiles()
    const first = await embedFontFiles([font], "Merge Family")
    const baseCSS = decodeStylesheet(first.stylesheet)
    const face = baseCSS.slice(baseCSS.indexOf("@font-face"))
    const otherWeight = face.replace(/font-weight: [^;]+;/, "font-weight: 700;")
    const italic = face.replace("font-style: normal;", "font-style: italic;")
    const replacement = face.replace(/font-weight: [^;]+;/, "font-weight: 400;").replace("font-display: swap;", "font-display: block;")
    const previous = fontCSSDataURL([face, otherWeight, italic].join("\n"))
    const next = fontCSSDataURL([replacement, otherWeight].join("\n"))

    const merged = embeddedFontRules(mergeEmbeddedFonts(previous, next))!
    expect(merged).toHaveLength(3)
    expect(merged.map(rule => [rule.style.fontWeight, rule.style.fontStyle])).toEqual([
      ["400", "normal"], ["700", "normal"], ["400", "italic"],
    ])
    expect(merged[0].style.getPropertyValue("font-display")).toBe("block")
  })

  it("escapes unsafe family text and encodes CSS as a data URL", () => {
    expect(cssFontString("<x>")).toBe('"\\3c x>"')
    expect(base64DataURL(new TextEncoder().encode("font"), "font/woff"))
      .toBe(`data:font/woff;base64,${btoa("font")}`)
  })
})
