import {describe, expect, it} from "vitest"

import {
  defaultDocumentTheme,
  documentThemes,
  documentTheme,
  editingDocumentThemeSource,
  documentWidgetStyleSource,
} from "./document-themes"

const ruleHeaders = (source: string) => Array.from(
  source.replaceAll(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g),
  match => match[1].trim(),
).filter(header => !header.startsWith("@") && !/^(?:from|to|\d+%)$/.test(header))

const layoutExamples = import.meta.glob("../examples/layouts/**/*.html", {query: "?raw", import: "default", eager: true}) as Record<string, string>

describe("document themes", () => {
  it("bounds installed widget hosts in document layouts while retaining sizing overrides", () => {
    const source = documentWidgetStyleSource([
      {tagName: "demo-card"}, {tagName: "demo-card"},
      {tagName: "demo-inline", editingConfig: {inline: true}},
      {tagName: "demo-contents", editingConfig: {inline: true}},
    ])
    expect(source).toContain("body:not([class~=\"ww-canvas\"]):not([class~=\"ww-slides\"]):not([class~=\"ww-board\"]) :is(demo-card, demo-contents, demo-inline)")
    expect(source).toContain("@layer webwriter-theme {\n:is(demo-card, demo-contents, demo-inline) p {\n  color: inherit;")
    expect(source).toContain("max-inline-size: min(100%, var(--ww-widget-max, var(--ww-prose-max, 45rem)));")
    expect(source).toContain(":is(demo-card):not([hidden]) {\n  display: block;")
    expect(source).toContain(":is(demo-inline, demo-contents):not([hidden]) {\n  display: inline-block;")
    expect(documentWidgetStyleSource([{tagName: "div"}])).toBe("")
  })

  it("defaults iframes to 16:9 with low-priority CSS in editing and exports", () => {
    for(const theme of documentThemes) {
      expect(theme.source).toContain(":where(iframe:not([is])) {\n    aspect-ratio: 16 / 9;\n  }")
      expect(editingDocumentThemeSource(theme)).toBe(theme.source)
    }
  })

  it("uses only light colors regardless of system preferences or theme attributes", () => {
    for(const theme of documentThemes) {
      expect(theme.source).toContain("color-scheme: only light;")
      expect(theme.source).not.toMatch(/prefers-color-scheme|data-theme=(?:light|dark)|holiday-css-dark|--dark-/)
      expect(theme.source).not.toMatch(/color-scheme:\s*(?:dark|light\s+dark)/)
      expect(editingDocumentThemeSource(theme)).toBe(theme.source)
    }
  })

  it("keeps embedded layout example themes light as well", () => {
    expect(Object.keys(layoutExamples).length).toBeGreaterThan(0)
    for(const source of Object.values(layoutExamples)) {
      expect(source).toContain("color-scheme: only light;")
      expect(source).not.toMatch(/prefers-color-scheme|data-theme=dark|color-scheme:\s*dark/)
    }
  })

  it("reserves the scrollbar at the trailing edge of document layouts", () => {
    for(const theme of documentThemes) {
      expect(theme.source).toContain('html:has(> body:not([class~="ww-canvas"]):not([class~="ww-slides"]):not([class~="ww-board"])) {\n      scrollbar-gutter: stable;')
      expect(theme.source).toContain('--ww-leading-gutter-balance: 16px;')
    }
  })
  it("paints document backgrounds on html and leaves body transparent", () => {
    for(const theme of documentThemes) {
      expect(theme.source).toContain('html:has(> body:not([class~="ww-canvas"]):not([class~="ww-slides"]):not([class~="ww-board"])) {\n    background-color:')
      expect(theme.source).toContain('body:not([class~="ww-canvas"]):not([class~="ww-slides"]):not([class~="ww-board"]) {\n    background: transparent;')
      expect(theme.source).toContain('padding-inline-start: calc(var(--ww-page-gutter, 1rem) + var(--ww-lane) + var(--ww-leading-gutter-balance, 0px));')
    }
  })
  it("reserves a bottom gutter for document actions in editing and saved themes", () => {
    for(const theme of documentThemes) {
      const source = editingDocumentThemeSource(theme)
      expect(source).toMatch(/body:not\(\[class~="ww-canvas"\]\):not\(\[class~="ww-slides"\]\)\s*\{[^}]*padding-block-end: max\(68px, var\(--ww-page-gutter, 1rem\)\);/)
      expect(source).toMatch(/@media print\s*\{\s*body:not\(\[class~="ww-canvas"\]\):not\(\[class~="ww-slides"\]\)\s*\{\s*padding-block-end: 0;/)
      expect(source).toBe(theme.source)
    }
  })
  it("includes symmetric side-lane geometry in every saved and editing theme", () => {
    for(const theme of documentThemes) {
      expect(theme.source).toContain("container-type: inline-size;")
      expect(theme.source).toContain("--ww-float-width: max(0px,")
      expect(theme.source).toContain("--ww-float-gap: var(--ww-page-gutter, 1rem);")
      expect(theme.source).toContain("margin-block: 0 calc(var(--ww-page-gutter, 1rem) + var(--ww-float-attribution-before, 0px) + var(--ww-attribution-after));")
      expect(theme.source).toContain("--ww-lane: 0px;")
      expect(theme.source).toContain("padding-inline: calc(var(--ww-page-gutter, 1rem) + var(--ww-lane));")
      expect(theme.source).toContain("@container (width >= 1200px)")
      expect(theme.source).toContain("@container (600px <= width < 1200px)")
      expect(theme.source).toContain("float: right !important;")
      expect(theme.source).toContain("--ww-lane: calc(var(--ww-float-width) + var(--ww-float-gap));")
      expect(theme.source).toContain(":has(:is(.ww-float-left, .ww-float-right,")
      expect(theme.source).toContain("inline-size: var(--ww-float-size, var(--ww-float-width)) !important;")
      expect(theme.source).toContain("clear: left;")
      expect(theme.source).toContain("clear: right;")
      expect(editingDocumentThemeSource(theme)).toBe(theme.source)
      expect(theme.source).toMatch(/p:not\(\[is\]\)\s*\{\s*display: flow-root;\s*min-inline-size: min\(300px, 100%\);/)
      expect(theme.source).toContain("@container (width < 600px)")
      expect(theme.source).toContain("float: none !important;")
      expect(theme.source).toContain("margin-left: auto !important;")
      expect(theme.source).toContain("margin-right: auto !important;")
      expect(theme.source).toContain("ww-canvas")
      expect(theme.source).toContain("ww-slides")
    }
  })
  it("gives header rows light blue and footer rows light gray backgrounds", () => {
    for(const theme of documentThemes) {
      const source = editingDocumentThemeSource(theme)

      expect(source).toMatch(/@layer webwriter-theme\s*\{[\s\S]*thead > tr > :is\(th, td\)\s*\{\s*background-color: #deebf7;/)
      expect(source).toMatch(/@layer webwriter-theme\s*\{[\s\S]*tfoot > tr > :is\(th, td\)\s*\{\s*background-color: #f2f2f2;/)
    }
  })
  it("keeps editor-owned legacy options placement out of saved document themes", () => {
    for(const theme of documentThemes) {
      expect(theme.source).not.toContain("::part(options)")
      expect(theme.source).not.toContain("◆element-capture-selected")
    }
  })
  it("blockifies ordinary top-level media and graphics in document columns across every theme", () => {
    for(const theme of documentThemes) {
      expect(theme.source).toMatch(/body:not\(\[class~="ww-canvas"\]\):not\(\[class~="ww-slides"\]\)\s*\{[\s\S]*?:is\(&,\s*& > main,\s*& > article,\s*& > section\) > :is\(picture,\s*img,\s*audio\[controls\],\s*video,\s*iframe,\s*embed,\s*object,\s*svg\):not\(\[is\]\)\s*\{\s*display:\s*block;/)
      expect(editingDocumentThemeSource(theme)).toContain(":is(&, & > main, & > article, & > section) > :is(picture, img, audio[controls], video, iframe, embed, object, svg):not([is])")
    }
  })
  it("gives native disclosure summaries a line-height minimum in every document layout", () => {
    for(const theme of documentThemes) {
      expect(theme.source).toMatch(/body:not\(\[class~="ww-canvas"\]\):not\(\[class~="ww-slides"\]\)\s*\{[\s\S]*?details:not\(\[is\]\) > summary\s*\{\s*min-block-size:\s*1lh;/)
    }
  })
  it("shares a fluid page and widget sizing defaults with standalone documents", () => {
    const source = defaultDocumentTheme.source
    const landmarks = source.slice(source.indexOf(" * Landmarks"), source.indexOf(" * Section\n"))

    expect(source).toContain("--ww-page-max: 2160px;")
    expect(source).toContain("--ww-prose-max: 45rem;")
    expect(source).toContain("--ww-page-gutter: clamp(1rem, 2vw, 2rem);")
    expect(source).toContain("max-inline-size: calc(var(--ww-page-max, 2160px) + 2 * var(--ww-page-gutter, 1rem));")
    expect(source).toContain("max-inline-size: var(--ww-widget-max, var(--ww-prose-max, 45rem));")
    expect(source).toContain("> :is(main, article, section) {\n      padding-inline: 0;\n      max-inline-size: none;")
    expect(source).toContain("inline-size: auto;")
    expect(source).toContain("min-inline-size: 0;")
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

  it("keeps authored floats in normal flow beside symmetric lanes", () => {
    const source = defaultDocumentTheme.source
    const landmarks = source.slice(source.indexOf(" * Landmarks"), source.indexOf(" * Section\n"))
    expect(landmarks).toContain("display: flow-root;")
    expect(landmarks).not.toMatch(/display:\s*(?:grid|flex)|grid-|column-count/)
    expect(source).toContain("clear: left;")
    expect(source).toContain("clear: right;")
    expect(source).toContain("--ww-lane: calc(var(--ww-float-width) + var(--ww-float-gap));")
    expect(source).toContain("@container (width >= 1200px)")
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
    // The shared float rules enforce bounded sizing and mobile placement.
    expect(source.match(/!important/g)!.length).toBeGreaterThanOrEqual(10)
    expect(source).toContain("--pico-font-size: 100%")
    expect(source).not.toMatch(/@media \(min-width: \d+px\)\s*\{\s*:root,\s*:host\s*\{\s*--pico-font-size:/)
    expect(ruleHeaders(source).map(selector => selector.replaceAll(/\.ww-(?:column-(?:group|left|middle|right|three)|float-(?:left|right|none))/g, "")).filter(selector => /(^|[\s>+~,():])\.[_a-zA-Z]/.test(selector))).toEqual([])
  })

  it("gives native disclosure and dialog elements complete base styles", () => {
    const source = documentTheme("base")!.source

    expect(source).toMatch(/details\s*\{[\s\S]*?margin-bottom:/)
    expect(source).toMatch(/details\s*\{[^}]*?border:\s*var\(--pico-border-width\) solid var\(--pico-muted-border-color\);/)
    expect(source).toMatch(/details\s*\{[^}]*?padding-inline-start:\s*calc\(var\(--pico-spacing\) \* 1\.5\);/)
    expect(source).toMatch(/details > summary\s*\{\s*margin-inline-start:\s*0;/)
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
