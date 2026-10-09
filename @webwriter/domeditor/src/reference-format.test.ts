import {describe, expect, it} from "vitest"
import {parseReference} from "./document-viewer.js"
import type {ReferenceData} from "./document-viewer.js"
import {formatReferences} from "./reference-format"

const entry = (href: string, data: ReferenceData) => ({
  href,
  data,
  anchors: [] as HTMLAnchorElement[],
  conflict: false,
})

describe("reference formatting", () => {
  it("uses href as BibTeX identity and emits an external URL", () => {
    const external = formatReferences([entry("https://example.test/paper", {
      id: "authored-id", type: "article-journal", title: "A paper", author: [{family: "Ng"}],
      issued: {"date-parts": [[2022]]},
    })], "bibtex")
    expect(external).toMatch(/@article/i)
    expect(external).toContain("example.test/paper")
    expect(external).not.toContain("authored-id")

    const fragment = formatReferences([entry("#paper", {
      type: "article-journal", title: "A paper", author: [{family: "Ng"}],
      issued: {"date-parts": [[2022]]},
    })], "bibtex")
    expect(fragment).toContain("paper")
    expect(fragment).not.toContain("URL =")
  })

  it("discards CSL id and URL fields when parsing authored reference metadata", () => {
    const parsed = parseReference(JSON.stringify({
      id: "citation-side-id", URL: "https://metadata.test/ignored", type: "book", title: "A book",
    }))
    expect(parsed).toEqual({type: "book", title: "A book"})
  })

  it("does not include a citation locator in bibliography output", () => {
    const output = formatReferences([entry("#chapter", {
      type: "book", title: "A book", author: [{family: "Ng"}],
      issued: {"date-parts": [[2020]]}, locator: "chapter 4, page 27",
    })], "bibliography")
    expect(output).toContain("A book")
    expect(output).not.toContain("chapter 4")
    expect(output).not.toContain("page 27")
  })
})
