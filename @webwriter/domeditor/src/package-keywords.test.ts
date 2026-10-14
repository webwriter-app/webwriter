import {describe, expect, it, vi} from "vitest"
import {packageKeywordPresentations} from "./package-keywords"

describe("package keyword presentation", () => {
  it("hides the discovery keyword and names standardized metadata naturally", () => {
    expect(packageKeywordPresentations([
      "webwriter-widget",
      "widget-practical",
      "widget-lang-de",
      "isced2011-1",
      "iscedf2013-05",
      "historical-map",
    ], "en")).toEqual([
      {label: "Practice", icon: "KeywordPractice"},
      {label: "German", icon: "KeywordLanguage"},
      {label: "Primary education", icon: "EducationPrimary"},
      {label: "Natural sciences, mathematics and statistics", icon: "EducationFieldSciences"},
      {label: "Historical Map"},
    ])
  })

  it("uses the broad education icon and name for more specific taxonomy codes", () => {
    expect(packageKeywordPresentations(["isced2011-65", "iscedf2013-0612"], "en")).toEqual([
      {label: "Bachelor’s or equivalent level", icon: "EducationDegree"},
      {label: "Information and communication technologies", icon: "EducationFieldTechnology"},
    ])
  })

  it("reuses language formatters and labels while reading mutable keyword arrays each time", () => {
    const NativeDisplayNames = Intl.DisplayNames
    let constructions = 0
    let lookups = 0
    class CountingDisplayNames extends NativeDisplayNames {
      constructor(locales: string | string[], options: Intl.DisplayNamesOptions) {
        constructions++
        super(locales, options)
      }

      of(code: string) {
        lookups++
        return super.of(code)
      }
    }
    vi.stubGlobal("Intl", {...Intl, DisplayNames: CountingDisplayNames})

    try {
      const keywords = ["widget-lang-de"]
      expect(packageKeywordPresentations(keywords, "fr-CA")[0].label).toBe("allemand")
      keywords.push("widget-lang-fr")
      expect(packageKeywordPresentations(keywords, "fr-CA").map(item => item.label)).toEqual([
        "allemand", "français",
      ])
      expect(packageKeywordPresentations(keywords, "fr-CA").map(item => item.label)).toEqual([
        "allemand", "français",
      ])
      expect(constructions).toBe(1)
      expect(lookups).toBe(2)
      expect(packageKeywordPresentations(["widget-lang-de"], "de")[0].label).toBe("Deutsch")
      expect(constructions).toBe(2)
    }
    finally {
      vi.unstubAllGlobals()
    }
  })

  it("falls back for invalid locales and tags, and when Intl.DisplayNames is unavailable", () => {
    expect(packageKeywordPresentations(["widget-lang-de"], "invalid_locale")).toEqual([
      {label: "De", icon: "KeywordLanguage"},
    ])
    expect(packageKeywordPresentations(["widget-lang-not a tag"], "en")).toEqual([
      {label: "Not A Tag", icon: "KeywordLanguage"},
    ])

    vi.stubGlobal("Intl", undefined)
    try {
      expect(packageKeywordPresentations(["widget-lang-fr"], "en")).toEqual([
        {label: "Fr", icon: "KeywordLanguage"},
      ])
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
