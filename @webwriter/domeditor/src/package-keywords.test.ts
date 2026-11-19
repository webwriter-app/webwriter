import {describe, expect, it, vi} from "vitest"
import {packageKeywordPresentations as present} from "./package-keywords"

const capabilities = [
  "widget-editable", "widget-allows-pointer-input", "widget-allows-keyboard-input", "widget-allows-touch-input",
]
const packageKeywordPresentations = (keywords: string[], locale: string, preferredLocales?: readonly string[]) =>
  present([...keywords, ...capabilities], locale, preferredLocales)

describe("package keyword presentation", () => {
  it("orders legacy badges by category and preserves custom tag text", () => {
    expect(packageKeywordPresentations([
      "webwriter-widget",
      "historical-map",
      "widget-lang-de",
      "isced2011-1",
      "widget-online",
      "iscedf2013-05",
      "widget-practical",
      "Practice",
    ], "en", ["de"])).toEqual([
      {kind: "type", label: "Practice", icon: "KeywordPractice"},
      {kind: "language", label: "German", icon: "KeywordLanguage", additionalLanguages: []},
      {kind: "field", label: "Natural sciences", icon: "EducationFieldSciences"},
      {kind: "online", label: "Online only", icon: "KeywordOnline"},
      {kind: "level", label: "Primary school", icon: "EducationSchool"},
      {kind: "custom", label: "historical-map"},
      {kind: "custom", label: "Practice"},
    ])
  })

  it("hides technical and widget identity tags, including conversion formats and migration versions", () => {
    expect(packageKeywordPresentations([
      "webwriter-widget", "widget-has-content", "widget-stateful", "widget-configurable", "WIDGET-REACTIVE",
      "widget-testable", "widget-supports-dynamic-loading", "widget-supports-shared-dependencies", "widget-standalone",
      "widget-convertible-to-image/SVG+xml", "widget-convertible-from-ww-list", "widget-convertible-from-.jff",
      "widget-migrates-from-1.2.3-RC.1+Build.02", "widget-convertible-from-", "widget-convertible-to-<b>",
      "widget-themeable", "local-history",
    ], "en")).toEqual([
      {kind: "display", label: "Themeable", icon: "Theme"},
      {kind: "custom", label: "local-history"},
    ])
  })

  it("uses an inverse badge only when its capability was omitted", () => {
    const inverseBadges = [
      {kind: "editing", label: "Not editable", icon: "KeywordNotEditable"},
      {kind: "input", label: "No pointer input", icon: "KeywordNoPointer"},
      {kind: "input", label: "No keyboard input", icon: "KeywordNoKeyboard"},
      {kind: "input", label: "No touch input", icon: "KeywordNoTouch"},
    ]
    expect(present([], "en")).toEqual(inverseBadges)
    expect(present(capabilities, "en")).toEqual([])
    for(const [index, keyword] of capabilities.entries()) {
      expect(present([keyword.toUpperCase(), keyword], "en"))
        .toEqual(inverseBadges.filter((_, badgeIndex) => index !== badgeIndex))
    }
  })

  it("sorts broad fields and levels and deduplicates more specific taxonomy codes", () => {
    expect(packageKeywordPresentations([
      "isced2011-65", "iscedf2013-9999", "isced2011-6", "iscedf2013-0612",
      "iscedf2013-06", "isced2011-34", "isced2011-44", "iscedf2013-00", "isced2011-99",
    ], "en")).toEqual([
      {kind: "field", label: "Generic programmes and qualifications", icon: "EducationFieldGeneral"},
      {kind: "field", label: "ICT", icon: "EducationFieldTechnology"},
      {kind: "field", label: "Other fields", icon: "EducationFieldOther"},
      {kind: "level", label: "High school", icon: "EducationSchool"},
      {kind: "level", label: "Vocational cert.", icon: "EducationSchool"},
      {kind: "level", label: "Bachelor's", icon: "EducationHigher"},
      {kind: "level", label: "Misc. ed.", icon: "EducationOther"},
    ])
  })

  it("combines both secondary levels and complete higher education coverage", () => {
    const labels = (codes: string[]) => packageKeywordPresentations(codes.map(code => "isced2011-" + code), "en")
      .map(badge => badge.label)
    expect(labels(["84", "2", "74", "65", "55", "34", "0"])).toEqual(["Preschool", "Secondary ed.", "Higher ed."])
    expect(labels(["2", "3", "44"])).toEqual(["Secondary ed."])
    expect(labels(["5", "6", "8"])).toEqual(["Associate deg.", "Bachelor's", "Doctorate"])
  })

  it.each([
    ["1", "2", "3", "4", "5", "6", "7", "8"],
    ["84", "74", "65", "55", "34", "2", "1"],
    ["0", "1", "2", "3", "5", "6", "7", "8", "9"],
  ])("combines primary, secondary and higher education into all levels: %j", (...codes) => {
    expect(packageKeywordPresentations([
      "widget-practical", "iscedf2013-06", ...codes.map(code => "ISCED2011-" + code),
    ], "en")).toEqual([
      {kind: "type", label: "Practice", icon: "KeywordPractice"},
      {kind: "field", label: "ICT", icon: "EducationFieldTechnology"},
      {kind: "level", label: "All levels", icon: "EducationSchool"},
    ])
  })

  it.each(["1", "2", "3", "5", "6", "7", "8"])("keeps individual level badges when level %s is missing", omitted => {
    const codes = ["1", "2", "3", "4", "5", "6", "7", "8"].filter(code => code !== omitted)
    const badges = packageKeywordPresentations(codes.map(code => "isced2011-" + code), "en")
    expect(badges.length).toBeGreaterThan(1)
    expect(badges.every(badge => badge.kind === "level" && badge.label !== "All levels")).toBe(true)
  })

  it("combines all ten subject fields into one badge", () => {
    const fields = Array.from({length: 10}, (_, index) => "iscedf2013-" + String(index + 1).padStart(2, "0"))
    fields[5] = "iscedf2013-0612"
    expect(packageKeywordPresentations(fields, "en")).toEqual([
      {kind: "field", label: "All fields", icon: "EducationFieldGeneral"},
    ])
    expect(packageKeywordPresentations(fields.slice(1), "en")).toHaveLength(9)
  })

  it.each([
    [["widget-online-use", "widget-online-edit", "widget-online"], "Online only"],
    [["widget-online-use", "widget-online-edit"], "Online when editing"],
    [["widget-online-use"], "Online when using"],
  ] as const)("shows one online badge for %j", (keywords, label) => {
    expect(packageKeywordPresentations([...keywords], "en")).toEqual([{kind: "online", label, icon: "KeywordOnline"}])
  })

  it("shows base language names and combines regional variants in both groups", () => {
    expect(packageKeywordPresentations([
      "widget-lang-fr-CA", "widget-lang-en-GB", "widget-lang-de-AT", "widget-lang-es-MX",
      "widget-lang-de-DE", "widget-lang-ES",
    ], "en-US", ["de-DE"])).toEqual([
      {kind: "language", label: "English, German", icon: "KeywordLanguage", additionalLanguages: ["French", "Spanish"]},
    ])
    expect(packageKeywordPresentations(["widget-lang-fr"], "en")[0]).toMatchObject({
      label: "", additionalLanguages: ["French"],
    })
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
      const keywords = [...capabilities, "widget-lang-de"]
      expect(present(keywords, "fr-CA", ["de"])[0].label).toBe("allemand")
      keywords.push("widget-lang-fr")
      expect(present(keywords, "fr-CA", ["de"])[0].label).toBe("allemand, français")
      expect(present(keywords, "fr-CA", ["de"])[0].label).toBe("allemand, français")
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
    expect(packageKeywordPresentations(["widget-lang-de"], "invalid_locale", ["de"])[0].label).toBe("De")
    expect(packageKeywordPresentations(["widget-lang-not a tag"], "en")[0].additionalLanguages).toEqual(["Not A Tag"])

    vi.stubGlobal("Intl", undefined)
    try {
      expect(packageKeywordPresentations(["widget-lang-fr"], "fr")[0].label).toBe("Fr")
    }
    finally {
      vi.unstubAllGlobals()
    }
  })
})
