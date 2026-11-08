import {describe, expect, it} from "vitest"
import {documentLanguageName, orderedLanguageOptions} from "./language-suggestions"

const supported = `
  en-US en-GB en-CA en-AU en-IN ar bg cs da nl et fi el hu ga it lv lt mt pl ro ru sk sl sv tr uk
  sq mk is eu gl cy lb he be la hr sr-Cyrl sr-Latn bs cnr nb nn ca pt-PT pt-BR de-DE de-AT de-CH
  fr-FR fr-CA fr-BE fr-CH es-ES es-419 zh-Hans zh-Hant ko ja fa-IR fa-AF ps hi id ms jv tl mn
  bn-BD bn-IN pa-Guru pa-Arab gu mr te ur kn or ne si ta ml my th lo vi km kk-Cyrl kk-Latn ky
  uz-Latn uz-Cyrl tg tk dv ka hy hyw az-Latn tpi
`.trim().split(/\s+/).sort()

describe("language suggestions", () => {
  it("offers exactly the supported tags, sorted by name", () => {
    const options = orderedLanguageOptions([])
    expect(options.map(option => option.value).sort()).toEqual(supported)
    expect(options.map(option => option.label)).toEqual(
      options.map(option => option.label).sort((a, b) => a.localeCompare(b, "en", {sensitivity: "base"})),
    )
    expect(options.every(option => option.description === option.value && !option.dividerBefore)).toBe(true)
    expect(documentLanguageName("cnr")).toBe("Montenegrin")
    expect(documentLanguageName("tl")).toBe("Tagalog")
    expect(documentLanguageName("hyw")).toBe("Western Armenian")
  })

  it("places preferred language families in an alphabetical section above the divider", () => {
    const options = orderedLanguageOptions(["fr-CA", "de-DE", "en-GB", "en-US", "xx"])
    const divider = options.findIndex(option => option.dividerBefore)
    expect(options.slice(0, divider).map(option => option.value)).toEqual([
      "en-AU", "en-CA", "en-IN", "en-GB", "en-US",
      "fr-BE", "fr-CA", "fr-FR", "fr-CH", "de-AT", "de-DE", "de-CH",
    ])
    expect(options.slice(divider).map(option => option.value)).toEqual(
      orderedLanguageOptions([]).filter(option => !options.slice(0, divider).some(item => item.value === option.value))
        .map(option => option.value),
    )
    expect(options.filter(option => option.dividerBefore)).toHaveLength(1)
  })

  it("names existing languages while preserving an unrecognized custom tag for display", () => {
    expect(documentLanguageName("en")).toBe("English")
    expect(documentLanguageName("ZH-hant")).toContain("Chinese (Traditional)")
    expect(documentLanguageName("x-custom")).toBe("x-custom")
    expect(documentLanguageName("")).toBe("")
  })
})
