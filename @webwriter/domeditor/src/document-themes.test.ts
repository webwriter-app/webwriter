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
    expect(landmarks).toContain("inline-size: auto;")
    expect(landmarks).toContain("max-inline-size: var(--ww-prose-max);")
    expect(landmarks).toContain("min-inline-size: 0;")
    expect(landmarks).toContain("margin: 1.25rem max(var(--ww-page-gutter), calc((100% - var(--ww-prose-max)) / 2));")
    expect(landmarks).toContain("min-block-size: calc(100vh - 2.5rem);")
    const body = landmarks.match(/\bbody\s*\{([^}]+)\}/)![1]
    expect(body).toContain("padding: 0;")
    expect(body).not.toMatch(/padding-(?:block|inline):/)
    expect(landmarks).not.toMatch(/:where\(body, [^)]+\)\s*\{[^}]*display:\s*flow-root/)
    expect(landmarks).not.toMatch(/min-(?:inline-size|width):\s*280px|overflow(?:-x)?:\s*hidden/)
  })

  it("spaces blocks with trailing margins so floated siblings do not offset text", () => {
    const source = defaultDocumentTheme.source
    expect(source).toContain("--ww-block-spacing: 1.25em;")
    expect(source).toContain(":is(body, body > main, body > article, body > section) > :not(:last-child) {\n  margin-block-end: var(--ww-block-spacing);")
    expect(source).not.toContain("> * + * {\n  margin-block-start: var(--ww-block-spacing);")
    const rules = source.replaceAll(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)
    for(const [, selector, declarations] of rules) {
      if(selector.split(",").some(part => part.trim() === "p")) {
        expect(declarations).not.toContain("margin-bottom: var(--pico-typography-spacing-vertical)")
      }
    }
    expect(source).toMatch(/\bp\s*\{\s*margin-bottom:\s*0;/)
    expect(source).toMatch(/\bp\s*\{[^}]*padding:\s*2px;/)
  })

  it("uses one reading column with normal flow for authored floats", () => {
    const source = defaultDocumentTheme.source
    const landmarks = source.slice(source.indexOf(" * Landmarks"), source.indexOf(" * Section\n"))
    expect(landmarks).toContain("display: flow-root;")
    expect(landmarks).not.toMatch(/display:\s*(?:grid|flex)|grid-|column-count/)
    expect(source).not.toContain("ww-column-")
    expect(source).not.toContain("@media (width > 60rem)")
  })

  it("lets widget hosts inherit document sizing tokens when adopting the theme", () => {
    const source = defaultDocumentTheme.source.replaceAll(/\/\*[\s\S]*?\*\//g, "")
    const sizingRules = Array.from(source.matchAll(/([^{}]+)\{([^{}]*)\}/g))
      .filter(([, , declarations]) => /--ww-(?:page-max|prose-max|page-gutter)\s*:/.test(declarations))

    expect(sizingRules.map(([, selector]) => selector.trim())).toEqual([":root"])
  })

  it("uses a layered Pico theme as the document default", () => {
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
