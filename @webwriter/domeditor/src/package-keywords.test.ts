import {describe, expect, it} from "vitest"
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
})
