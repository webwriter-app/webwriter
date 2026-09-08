import {describe, expect, it} from "vitest"
import {groupedLanguageOptions} from "./language-suggestions"
import data from "./language-suggestions-data.json"

describe("language suggestions", () => {
  it("groups UN languages before the remaining EU and national languages, without duplicates", () => {
    const options = groupedLanguageOptions()
    expect([...new Set(options.map(option => option.group))])
      .toEqual(["World languages", "European languages", "Other languages"])
    expect(options.filter(option => option.group === "World languages").map(option => option.value))
      .toEqual(["en", "zh", "es", "ar", "fr", "ru"])
    expect(options.filter(option => option.group === "European languages")).toHaveLength(21)
    expect(options.find(option => option.value === "pt")?.group).toBe("European languages")
    expect(options.find(option => option.value === "hi")?.group).toBe("Other languages")
    expect(new Set(options.map(option => option.value)).size).toBe(options.length)
    const speakers: Record<string, number> = data.speakers
    for(const group of new Set(options.map(option => option.group))) {
      const counts = options.filter(option => option.group === group).map(option => speakers[option.value])
      expect(counts.every(count => Number.isFinite(count) && count > 0)).toBe(true)
      expect(counts).toEqual([...counts].sort((a, b) => b - a))
    }
  })

  it("caps country contributions before deduplication, preserving languages qualifying elsewhere", () => {
    expect(Object.values(data.countries).every(codes => codes.length <= 3)).toBe(true)
    expect(data.countries.ZA).toEqual(["en", "zu", "xh"])
    expect(data.countries.ZW).toEqual(["sn", "en", "nd"])
    expect(data.countries.BO).toEqual(["es", "qu", "ay"])
    expect(data.countries.SG).toEqual(["en", "zh", "ms"])
    expect(data.countries.CH).toEqual(["de", "fr", "it"])
    const values = groupedLanguageOptions().map(option => option.value)
    expect(values).toContain("ta") // Still qualifies through Sri Lanka.
    expect(values).toContain("nzs")
    expect(values).not.toContain("af") // Fourth in South Africa; not official elsewhere.
    expect(values).not.toContain("eo")
  })
})
