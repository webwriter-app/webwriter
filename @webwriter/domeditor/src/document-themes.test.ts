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
    expect(landmarks).not.toMatch(/min-(?:inline-size|width):\s*280px|overflow(?:-x)?:\s*hidden/)
  })

  it("owns configurable spacing between blocks without Pico paragraph bottom margins", () => {
    const source = defaultDocumentTheme.source
    expect(source).toContain("--ww-block-spacing: 1.25em;")
    expect(source).toContain(":is(body, body > main, body > article, body > section) > * + * {\n  margin-block-start: var(--ww-block-spacing);")
    const rules = source.replaceAll(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)
    for(const [, selector, declarations] of rules) {
      if(selector.split(",").some(part => part.trim() === "p")) {
        expect(declarations).not.toContain("margin-bottom: var(--pico-typography-spacing-vertical)")
      }
    }
    expect(source).toMatch(/\bp\s*\{\s*margin-bottom:\s*0;/)
  })

  it("uses two automatic-row tracks with full-width items and centered reading blocks", () => {
    const source = defaultDocumentTheme.source
    expect(source).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));")
    expect(source).toContain("grid-auto-rows: auto;")
    expect(source).toContain("grid-column: 1 / -1;\n  inline-size: 100%;\n  min-inline-size: 0;")
    expect(source).toContain("max-inline-size: min(100%, var(--ww-prose-max));\n  margin-inline: auto;")
    expect(source).toContain("grid-auto-flow: row;")
    expect(source).toMatch(/> \*\s*\{\s*grid-column: 1 \/ -1;/)
    expect(source).toContain("> :where(h1, h2, h3, h4, h5, h6, p, hr, details, ul, ol, dl, blockquote, pre, table):where(:not([is]))")
    expect(source).toContain("max-inline-size: var(--ww-prose-max);\n  margin-inline: auto;")
  })

  it("pairs column sides with text in reading order and collapses placements on narrow pages", () => {
    const source = defaultDocumentTheme.source
    for(const [side, column, textColumn] of [["left", 1, 2], ["right", 2, 1]] as const) {
      const selector = `:where(.ww-column-${side})`
      expect(source).toContain(`> ${selector} {\n  grid-column: ${column};`)
      const paired = side === "left"
        ? source.slice(source.indexOf(`> ${selector} +`))
        : source.slice(source.indexOf(`:has(+ ${selector})`))
      expect(paired.slice(0, paired.indexOf("}"))).toContain(`grid-column: ${textColumn};`)
    }
    expect(source).toContain("grid-column: 1;\n  margin-inline: auto 0;")
    expect(source).toContain("grid-column: 2;\n  margin-inline: 0 auto;")
    const responsive = source.slice(source.indexOf("@media (max-width: 60rem)"))
    expect(responsive).toContain("grid-template-columns: minmax(0, 1fr);")
    expect(responsive).toMatch(/> \*\s*\{\s*grid-column: 1 \/ -1;/)
  })

  it("lays out flat column groups with independent flow and narrow-page borders", () => {
    const source = defaultDocumentTheme.source
    const group = source.slice(source.indexOf(".ww-column-group {"))
    expect(source).not.toContain(":where(body, body > main, body > article, body > section)\n  > :where(.ww-column-group)")
    expect(group).toContain("grid-column: 1 / -1;")
    expect(group).toContain("inline-size: 100%;")
    expect(group).toContain("min-block-size: 1.5em;")
    expect(group).toContain("column-count: 2;")
    expect(group).toContain("break-before: column;")
    expect(group).toContain("column-gap: var(--ww-page-gutter);")
    expect(group).toContain("row-gap: var(--ww-block-spacing);")
    expect(group).toContain(".ww-column-group > :is(.ww-column-left, .ww-column-middle, .ww-column-right) {")
    expect(group).toContain("max-inline-size: var(--ww-prose-max);")
    expect(group).toContain("margin-block: 0;")

    const narrow = source.slice(source.indexOf("@media (max-width: 60rem)", source.indexOf(".ww-column-group {")))
    expect(narrow).toContain("column-count: auto;")
    expect(narrow).toContain(".ww-column-group > * {")
    expect(narrow).toContain("float: none;")
    expect(narrow).toContain("border-block: var(--pico-border-width) solid var(--pico-muted-border-color);")
  })

  it("uses row gaps instead of item block margins only on wide pages", () => {
    const source = defaultDocumentTheme.source
    const wide = source.slice(source.indexOf("@media (width > 60rem)"))
    expect(wide).toContain("row-gap: var(--ww-block-spacing);")
    expect(wide).toContain(":is(body, body > main, body > article, body > section) > * {\n    margin-block: 0;")
    expect(wide).not.toContain(".ww-column-right")
    expect(source.indexOf("@media (width > 60rem)")).toBeGreaterThan(source.lastIndexOf("margin-bottom:"))
    expect(source).toContain("margin-block-start: var(--ww-block-spacing);")
  })

  it("lets widget hosts inherit document sizing tokens when adopting the theme", () => {
    const source = defaultDocumentTheme.source.replaceAll(/\/\*[\s\S]*?\*\//g, "")
    const sizingRules = Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      .filter(([, , declarations]) => /--ww-(?:page-max|prose-max|page-gutter)\s*:/.test(declarations))

    expect(sizingRules.map(([, selector]) => selector.trim())).toEqual([":root"])
  })

  it("uses a layered Pico theme with explicit column-group classes as the document default", () => {
    const source = documentTheme("base")!.source

    expect(source).toContain("Pico CSS ✨ v2.1.1")
    expect(source).toContain("@layer webwriter-theme")
    expect(source).not.toContain("!important")
    expect(source).toContain("--pico-font-size: 100%")
    expect(source).not.toMatch(/@media \(min-width: \d+px\)\s*\{\s*:root,\s*:host\s*\{\s*--pico-font-size:/)
    expect(ruleHeaders(source).map(selector => selector.replaceAll(/\.ww-column-(?:group|left|middle|right|three)/g, "")).filter(selector => /(^|[\s>+~,():])\.[_a-zA-Z]/.test(selector))).toEqual([])
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
