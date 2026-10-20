// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {APP_SETTINGS_STORAGE_KEY, defaultAppSettings, loadAppSettings, persistAppSettings} from "./app-settings"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
})

describe("app settings language", () => {
  it.each([
    {preferences: ["de-DE", "fr-CA"], fallback: "en-US", expected: "de"},
    {preferences: ["xx-ZZ", "fr-CA", "de-DE"], fallback: "en-US", expected: "fr"},
    {preferences: ["ja-JP", "en-US"], fallback: "en-US", expected: "ja"},
    {preferences: ["PT_br"], fallback: "en-US", expected: "pt"},
    {preferences: [], fallback: "nl-NL", expected: "nl"},
    {preferences: undefined, fallback: "it-IT", expected: "it"},
    {preferences: ["xx-ZZ"], fallback: "xx", expected: "en"},
    {preferences: [], fallback: "", expected: "en"},
  ])("detects $expected from browser preferences $preferences", ({preferences, fallback, expected}) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(preferences as readonly string[])
    vi.spyOn(navigator, "language", "get").mockReturnValue(fallback)
    expect(defaultAppSettings().language).toBe(expected)
    expect(loadAppSettings().language).toBe(expected)
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)).toBeNull()
  })

  it("falls back to English when navigator is unavailable", () => {
    vi.stubGlobal("navigator", undefined)
    expect(defaultAppSettings(false).language).toBe("en")
  })

  it.each([undefined, "", null, 42])("detects the language when saved settings contain %s", language => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"])
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({language, shortcutsVersion: 2}))
    expect(loadAppSettings().language).toBe("de")
  })

  it.each(["en", "fr", "en-GB"])("keeps the saved %s override when browser preferences change", language => {
    const preferences = vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"])
    persistAppSettings({...defaultAppSettings(), language})
    preferences.mockReturnValue(["ja-JP"])
    expect(loadAppSettings().language).toBe(language)
  })

  it("detects the language when stored settings cannot be read", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"])
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, "{")
    expect(loadAppSettings().language).toBe("de")
    vi.stubGlobal("localStorage", {getItem: () => { throw new Error("Storage unavailable") }})
    expect(loadAppSettings().language).toBe("de")
  })
})

describe("app settings layout persistence", () => {
  it("loads Board as a saved default layout", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({defaultLayout: "board"}))
    expect(loadAppSettings().defaultLayout).toBe("board")
  })

  it("accepts Board as a legacy template fallback", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({defaultTemplate: "board"}))
    expect(loadAppSettings().defaultLayout).toBe("board")
  })

  it("keeps Document as the default layout", () => {
    expect(defaultAppSettings().defaultLayout).toBe("document")
  })
})

describe("guided tour setting", () => {
  it("defaults on and accepts only a saved boolean", () => {
    expect(defaultAppSettings().showGuidedTour).toBe(true)
    for(const value of [undefined, "yes", true, false]) {
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({showGuidedTour: value}))
      expect(loadAppSettings().showGuidedTour).toBe(typeof value === "boolean" ? value : true)
    }
  })
})
