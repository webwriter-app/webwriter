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
    expect(source).toMatch(/details summary::after\s*\{[\s\S]*?background-image:/)
    expect(source).toMatch(/dialog\s*\{[\s\S]*?border-radius:[\s\S]*?box-shadow:/)
    expect(source).toMatch(/dialog::backdrop\s*\{[\s\S]*?backdrop-filter:[\s\S]*?background-color:/)
    expect(source).toMatch(/dialog:not\(\[open\]\), dialog\[open=false\]\s*\{[\s\S]*?display:\s*none;/)
  })

  it("layers older themes before applying them to the editing document", () => {
    const water = documentTheme("water")!

    expect(defaultDocumentTheme.value).toBe("base")
    expect(editingDocumentThemeSource(defaultDocumentTheme)).toBe(defaultDocumentTheme.source)
    expect(editingDocumentThemeSource(water)).toMatch(/^@layer webwriter-theme \{/)
  })
})
