// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {APP_SETTINGS_STORAGE_KEY, builtinShortcuts, defaultAppSettings, loadAppSettings, persistAppSettings, reservedShortcutReason, formatShortcut, shortcutParts, shortcutFromEvent, getShortcutLayout, effectiveShortcutLayout, commandForShortcutEvent, physicalShortcutForCommand} from "./app-settings"

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
})

describe("app settings language", () => {
  it.each([
    {preferences: ["de-DE", "fr-CA"], fallback: "en-US", expected: "de-DE"},
    {preferences: ["xx-ZZ", "fr-CA", "de-DE"], fallback: "en-US", expected: "fr-CA"},
    {preferences: ["ja-JP", "en-US"], fallback: "en-US", expected: "ja"},
    {preferences: ["PT_br"], fallback: "en-US", expected: "pt-BR"},
    {preferences: ["zh-TW"], fallback: "en-US", expected: "zh-Hant"},
    {preferences: ["sr-Latn-RS"], fallback: "en-US", expected: "sr-Latn"},
    {preferences: ["sr-ME"], fallback: "en-US", expected: "cnr"},
    {preferences: ["tl"], fallback: "en-US", expected: "tl"},
    {preferences: ["fr"], fallback: "en-US", expected: "fr-FR"},
    {preferences: [], fallback: "nl-NL", expected: "nl"},
    {preferences: undefined, fallback: "it-IT", expected: "it"},
    {preferences: ["xx-ZZ"], fallback: "xx", expected: "en-US"},
    {preferences: [], fallback: "", expected: "en-US"},
  ])("detects $expected from browser preferences $preferences", ({preferences, fallback, expected}) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(preferences as readonly string[])
    vi.spyOn(navigator, "language", "get").mockReturnValue(fallback)
    expect(defaultAppSettings().language).toBe(expected)
    expect(loadAppSettings().language).toBe(expected)
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)).toBeNull()
  })

  it("falls back to English when navigator is unavailable", () => {
    vi.stubGlobal("navigator", undefined)
    expect(defaultAppSettings(false).language).toBe("en-US")
  })

  it.each([undefined, "", null, 42])("detects the language when saved settings contain %s", language => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"])
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({language, shortcutsVersion: 2}))
    expect(loadAppSettings().language).toBe("de-DE")
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
    expect(loadAppSettings().language).toBe("de-DE")
    vi.stubGlobal("localStorage", {getItem: () => { throw new Error("Storage unavailable") }})
    expect(loadAppSettings().language).toBe("de-DE")
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

describe("formula shortcut migration", () => {
  it.each([true, false])("releases zoom reset and reserves it against reassignment (Apple: %s)", apple => {
    const zoomReset = `${apple ? "Meta" : "Ctrl"}+0`
    expect(builtinShortcuts(apple).has(zoomReset)).toBe(false)
    expect(builtinShortcuts(apple).has("Alt+Shift+0")).toBe(true)
    expect(reservedShortcutReason(zoomReset, apple)).not.toBe("")
    expect(reservedShortcutReason("Alt+Shift+0", apple)).toBe("")
  })

  it.each(["Ctrl+0", "Meta+0", "Alt+Shift+0"])("replaces the former formula shortcut %s", oldShortcut => {
    const settings = defaultAppSettings(false)
    settings.shortcuts["insert.formula"] = oldShortcut
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...settings, shortcutsVersion: 2}))
    expect(loadAppSettings().shortcuts["insert.formula"]).toBe("Alt+Shift+9")
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)!).shortcutsVersion).toBe(3)
  })

  it("preserves disabled and custom formula shortcuts", () => {
    for(const shortcut of ["", "Alt+F9"]) {
      const settings = defaultAppSettings(false)
      settings.shortcuts["insert.formula"] = shortcut
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...settings, shortcutsVersion: 2}))
      expect(loadAppSettings().shortcuts["insert.formula"]).toBe(shortcut)
      localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
    }
  })

  it("disables the former formula shortcut when its replacement is occupied", () => {
    const settings = defaultAppSettings(false)
    settings.shortcuts["insert.formula"] = "Ctrl+0"
    settings.shortcuts["insert.heading"] = "Physical:Alt+Shift+9"
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...settings, shortcutsVersion: 2}))
    const loaded = loadAppSettings()
    expect(loaded.shortcuts["insert.formula"]).toBe("")
    expect(loaded.shortcuts["insert.heading"]).toBe("Physical:Alt+Shift+9")
  })
})

describe("Feedback shortcut migration", () => {
  it.each([undefined, "Alt+Shift+6"])("releases zero for Feedback with saved binding %s", feedback => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({shortcutsVersion: 3, shortcuts: {
      "insert.formula": "Alt+Shift+0", "toolbox.feedback": feedback, "toolbox.style": "Alt+Shift+2",
    }}))
    const {shortcuts} = loadAppSettings()
    expect(shortcuts["insert.formula"]).toBe("Alt+Shift+9")
    expect(shortcuts["toolbox.feedback"]).toBe("Alt+Shift+0")
    expect(shortcuts).not.toHaveProperty("toolbox.style")
    expect(loadAppSettings().shortcuts).toEqual(shortcuts)
  })

  it.each(["", "Alt+F9"])("keeps an explicit Feedback binding of %s", feedback => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({shortcutsVersion: 3, shortcuts: {
      "insert.formula": "Alt+Shift+0", "toolbox.feedback": feedback,
    }}))
    expect(loadAppSettings().shortcuts["toolbox.feedback"]).toBe(feedback)
  })

  it("leaves Feedback unassigned if zero is already customized", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({shortcutsVersion: 3, shortcuts: {
      "editor.undo": "Physical:Alt+Shift+0", "toolbox.feedback": "Alt+Shift+6",
    }}))
    const {shortcuts} = loadAppSettings()
    expect(shortcuts["editor.undo"]).toBe("Physical:Alt+Shift+0")
    expect(shortcuts["toolbox.feedback"]).toBe("")
  })
})


describe("keyboard layout shortcut labels", () => {
  it("loads new picker and toolbox shortcuts without taking saved custom bindings", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({shortcutsVersion: 3, shortcuts: {
      "editor.undo": "Physical:Alt+Shift+G", "editor.redo": "Alt+Shift+4", "text.clear": "",
    }}))
    const {shortcuts} = loadAppSettings()
    expect(shortcuts["editor.undo"]).toBe("Physical:Alt+Shift+G")
    expect(shortcuts["editor.redo"]).toBe("Alt+Shift+4")
    expect(shortcuts["text.fontFamily"]).toBe("")
    expect(shortcuts["toolbox.review"]).toBe("")
    expect(shortcuts["text.fontSize"]).toBe("Alt+Shift+H")
    expect(shortcuts["text.clear"]).toBe("")
  })

  it("labels physical shortcuts using the active layout without changing matching", () => {
    const layout = new Map([["KeyY", "z"], ["KeyZ", "y"]])
    expect(formatShortcut("Alt+Shift+Y", false, layout)).toBe("Alt+Shift+Z")
    expect(formatShortcut("Alt+Shift+Y", true, layout)).toBe("⌥⇧Z")
    expect(shortcutParts("Alt+Shift+Y", false, layout)).toEqual(["Alt", "⇧ Shift", "Z"])
    expect(shortcutFromEvent(new KeyboardEvent("keydown", {code: "KeyY", key: "Z", altKey: true, shiftKey: true}))).toBe("Alt+Shift+Y")
    expect(formatShortcut("Alt+Shift+Y", false)).toBe("Alt+Shift+Y")
  })

  it("falls back when the layout API is unavailable or denied", async () => {
    vi.stubGlobal("navigator", {})
    expect(await getShortcutLayout()).toBeUndefined()
    vi.stubGlobal("navigator", {keyboard: {getLayoutMap: () => Promise.reject(new Error("denied"))}})
    expect(await getShortcutLayout()).toBeUndefined()
  })
})


describe("keyboard layout preference", () => {
  it.each([["de-DE", "Z"], ["fr-FR", "Y"], ["fr-CH", "Z"], ["en-US", "Y"]])
  ("guesses shortcut labels from %s", (language, expected) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([language])
    expect(formatShortcut("Alt+Shift+Y", false, effectiveShortcutLayout("auto"))).toBe(`Alt+Shift+${expected}`)
  })

  it("prefers the detected layout and honors explicit overrides", () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(["de-DE"])
    const detected = new Map([["KeyY", "x"]])
    expect(formatShortcut("Alt+Y", false, effectiveShortcutLayout("auto", detected))).toBe("Alt+X")
    expect(formatShortcut("Alt+Y", false, effectiveShortcutLayout("qwerty", detected))).toBe("Alt+Y")
    expect(formatShortcut("Alt+Y", false, effectiveShortcutLayout("qwertz", detected))).toBe("Alt+Z")
    expect(formatShortcut("Alt+Q", false, effectiveShortcutLayout("azerty"))).toBe("Alt+A")
  })

  it("persists a chosen layout and handles invalid stored preferences", () => {
    const settings = defaultAppSettings()
    settings.keyboardLayout = "qwertz"
    persistAppSettings(settings)
    expect(loadAppSettings().keyboardLayout).toBe("qwertz")
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...settings, keyboardLayout: "unknown"}))
    expect(loadAppSettings().keyboardLayout).toBe("auto")
  })
})


describe("additional keyboard layouts", () => {
  it.each([
    ["awerty", {Q: "Ä", X: "Ü", C: "Ç", V: "Ý", Y: "Y"}],
    ["querty", {W: "Ü", I: "İ", Q: "Q"}],
    ["dvorak", {Q: "'", W: ",", E: ".", Y: "F", F: "U", Z: ";", X: "Q", B: "X"}],
    ["colemak", {E: "F", P: ";", Y: "J", F: "T", N: "K", Z: "Z"}],
    ["workman", {W: "D", P: ";", H: "Y", M: "L", C: "M", B: "V"}],
  ] as const)("maps and persists %s", (preference, labels) => {
    const settings = defaultAppSettings()
    settings.keyboardLayout = preference
    persistAppSettings(settings)
    expect(loadAppSettings().keyboardLayout).toBe(preference)
    for(const [key, label] of Object.entries(labels)) {
      expect(formatShortcut(`Alt+${key}`, false, effectiveShortcutLayout(preference))).toBe(`Alt+${label}`)
    }
  })

  it.each([["tk-TM", "Q", "Ä"], ["az-Latn-AZ", "W", "Ü"], ["az-Cyrl-AZ", "W", "W"]])
  ("uses a language fallback for %s", (language, key, label) => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue([language])
    expect(formatShortcut(`Alt+${key}`, false, effectiveShortcutLayout("auto"))).toBe(`Alt+${label}`)
  })
})


describe("standard history shortcuts", () => {
  it.each([true, false])("uses the letter on QWERTZ for undo and redo (Apple: %s)", apple => {
    const settings = defaultAppSettings(apple)
    const event = (key: string, code: string, shiftKey = false) => new KeyboardEvent("keydown", {
      key, code, shiftKey, metaKey: apple, ctrlKey: !apple,
    })
    expect(commandForShortcutEvent(settings.shortcuts, event("z", "KeyY"), apple)?.id).toBe("editor.undo")
    expect(commandForShortcutEvent(settings.shortcuts, apple ? event("Z", "KeyY", true) : event("y", "KeyZ"), apple)?.id).toBe("editor.redo")
    const layout = effectiveShortcutLayout("qwertz")
    expect(physicalShortcutForCommand("editor.undo", settings.shortcuts["editor.undo"], layout, apple)).toBe(`${apple ? "Meta" : "Ctrl"}+Y`)
  })

  it("retains physical matching for recorded history bindings", () => {
    const settings = defaultAppSettings(false)
    settings.shortcuts["editor.undo"] = "Physical:Ctrl+Z"
    const germanY = new KeyboardEvent("keydown", {key: "y", code: "KeyZ", ctrlKey: true})
    expect(commandForShortcutEvent(settings.shortcuts, germanY, false)?.id).toBe("editor.undo")
    expect(formatShortcut(settings.shortcuts["editor.undo"], false, effectiveShortcutLayout("qwertz"))).toBe("Ctrl+Y")
    settings.shortcuts["editor.undo"] = ""
    settings.shortcuts["editor.redo"] = ""
    expect(commandForShortcutEvent(settings.shortcuts, germanY, false)).toBeUndefined()
  })
})
