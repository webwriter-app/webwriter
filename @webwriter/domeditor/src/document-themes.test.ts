import {describe, expect, it} from "vitest"

import {
  defaultDocumentTheme,
  documentTheme,
  editingDocumentThemeSource,
} from "./document-themes"

const ruleHeaders = (source: string) => Array.from(
  source.replaceAll(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g),
  match => match[1].trim(),
).filter(header => !header.startsWith("@") && !/^(?:from|to|\d+%)$/.test(header))

describe("document themes", () => {
  it("shares a fluid page and stable reading measure with standalone documents", () => {
    const source = defaultDocumentTheme.source
    const landmarks = source.slice(source.indexOf(" * Landmarks"), source.indexOf(" * Section\n"))

    expect(source).toContain("--ww-page-max: 2160px;")
    expect(source).toContain("--ww-prose-max: 45rem;")
    expect(source).toContain("--ww-page-gutter: clamp(1rem, 2vw, 2rem);")
    expect(landmarks).toContain("max-inline-size: calc(var(--ww-page-max) + 2 * var(--ww-page-gutter));")
    expect(landmarks).toContain("min-inline-size: 0;")
    expect(landmarks).not.toMatch(/@media|min-(?:inline-size|width):\s*280px|overflow(?:-x)?:\s*hidden/)
  })

  it("defaults every direct body child to the reading measure without changing its display", () => {
    const source = defaultDocumentTheme.source.replaceAll(/\/\*[\s\S]*?\*\//g, "")
    const declarations = source.match(/body > \*\s*\{([^}]*)\}/)![1]

    expect(declarations).toContain("max-inline-size: var(--ww-prose-max, 45rem);")
    expect(declarations).toContain("margin-inline: auto;")
    expect(declarations).not.toMatch(/(?:^|;)\s*(?:display|min-inline-size|block-size)\s*:/)
  })

  it("keeps nested reading blocks capped when their section opts into more space", () => {
    const source = defaultDocumentTheme.source.replaceAll(/\/\*[\s\S]*?\*\//g, "")
    const readingRule = Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      .find(([, , declarations]) => declarations.includes("max-inline-size: var(--ww-prose-max)"))!
    expect(readingRule[1].trim()).toBe(":where(body, body > main, body > article, body > section)\n"
      + "  > :where(h1, h2, h3, h4, h5, h6, p, ul, ol, dl, blockquote)")
    expect(readingRule[2]).toContain("margin-inline: auto;")
  })

  it("lets widget hosts inherit document sizing tokens when adopting the theme", () => {
    const source = defaultDocumentTheme.source.replaceAll(/\/\*[\s\S]*?\*\//g, "")
    const sizingRules = Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      .filter(([, , declarations]) => /--ww-(?:page-max|prose-max|page-gutter)\s*:/.test(declarations))

    expect(sizingRules.map(([, selector]) => selector.trim())).toEqual([":root"])
  })

  it("uses a layered, classless Pico theme as the document default", () => {
    const source = documentTheme("base")!.source

    expect(source).toContain("Pico CSS ✨ v2.1.1")
    expect(source).toContain("@layer webwriter-theme")
    expect(source).not.toContain("!important")
    expect(source).toContain("--pico-font-size: 100%")
    expect(source).not.toMatch(/@media \(min-width: \d+px\)\s*\{\s*:root,\s*:host\s*\{\s*--pico-font-size:/)
    expect(ruleHeaders(source).filter(selector => /(^|[\s>+~,():])\.[_a-zA-Z]/.test(selector))).toEqual([])
  })

  it("gives native disclosure and dialog elements complete base styles", () => {
    const source = documentTheme("base")!.source

    expect(source).toMatch(/details\s*\{[\s\S]*?margin-bottom:/)
    expect(source).toMatch(/details\s*\{[^}]*?border:\s*var\(--pico-border-width\) solid var\(--pico-muted-border-color\);/)
    expect(source).toMatch(/details\s*\{[^}]*?padding-inline-start:\s*calc\(var\(--pico-spacing\) \* 1\.5\);/)
    expect(source).toMatch(/details > summary\s*\{\s*margin-inline-start:\s*calc\(var\(--pico-spacing\) \* -0\.75\);/)
    expect(source).toMatch(/details summary::after\s*\{[\s\S]*?background-image:/)
    expect(source).toMatch(/dialog\s*\{[\s\S]*?border-radius:[\s\S]*?box-shadow:/)
    expect(source).toMatch(/dialog::backdrop\s*\{[\s\S]*?backdrop-filter:[\s\S]*?background-color:/)
    expect(source).toMatch(/dialog:not\(\[open\]\), dialog\[open=false\]\s*\{[\s\S]*?display:\s*none;/)
  })

  it("preserves native list markers at every nesting depth", () => {
    const source = documentTheme("base")!.source
    const rules = source.replaceAll(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)

    for(const [, selector, declarations] of rules) {
      if(/\b(?:ul|ol|li)\b/.test(selector) && !selector.trim().startsWith("nav ")) {
        expect(declarations).not.toMatch(/list-style(?:-type)?\s*:/)
      }
    }
  })

  it("pads both sides of the divider while keeping its line in the content box", () => {
    const source = documentTheme("base")!.source
    const declarations = source.match(/\bhr\s*\{([^}]+)\}/)![1]

    expect(declarations).toContain("padding-block: 5px;")
    expect(declarations).toContain("box-sizing: content-box;")
    expect(declarations).toContain("height: 1px;")
    expect(declarations).toContain("border: 0;")
    expect(declarations).toContain("background-clip: content-box;")
  })

  it("layers older themes before applying them to the editing document", () => {
    const water = documentTheme("water")!

    expect(defaultDocumentTheme.value).toBe("base")
    expect(editingDocumentThemeSource(defaultDocumentTheme)).toBe(defaultDocumentTheme.source)
    expect(editingDocumentThemeSource(water)).toMatch(/^@layer webwriter-theme \{/)
  })
})
