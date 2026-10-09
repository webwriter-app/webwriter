// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {version, dependencies, devDependencies} from "../../package.json"
import componentLicenses from "virtual:component-licenses"
import {
  APP_SETTINGS_STORAGE_KEY,
  appCommands,
  defaultAppSettings,
  loadAppSettings,
  persistAppSettings,
  reservedShortcutReason,
  shortcutMatchesEvent,
  type AppSettings,
} from "../app-settings"
import {excludedMarkNames} from "../marks"
import {AppRibbon} from "./ribbon"
import {SettingsPanel} from "./settings-panel"
import type {RibbonMenu} from "./ribbon-menu"

const shortcutEvent = (shortcut: string) => {
  const parts = shortcut.split("+")
  const key = parts.at(-1)!
  return new KeyboardEvent("keydown", {
    key,
    code: key.length === 1 ? `Key${key}` : key,
    metaKey: parts.includes("Meta"),
    ctrlKey: parts.includes("Ctrl"),
    altKey: parts.includes("Alt"),
    shiftKey: parts.includes("Shift"),
    bubbles: true,
    composed: true,
    cancelable: true,
  })
}

async function mountPanel(settings = defaultAppSettings()) {
  const panel = new SettingsPanel()
  panel.settings = settings
  document.body.append(panel)
  await panel.updateComplete
  return panel
}

afterEach(() => {
  vi.unstubAllGlobals()
  document.body.replaceChildren()
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
})

describe("settings panel", () => {
  it("opens all direct component licenses as plain text from a small link at the bottom", async () => {
    const panel = await mountPanel()
    const root = panel.shadowRoot!
    const link = root.querySelector<HTMLButtonElement>(".licenses-link")!
    const dialog = root.querySelector<HTMLDialogElement>("#licenses-dialog")!
    expect(root.querySelector(".settings-panel")!.lastElementChild).toBe(link)
    expect(link.textContent?.trim()).toBe("View licenses of components")
    expect(getComputedStyle(link).fontSize).toBe("10.56px")
    expect(getComputedStyle(link).textDecoration).toBe("underline")
    expect(dialog.open).toBe(false)
    link.click()
    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute("aria-labelledby")).toBe("licenses-title")
    const text = dialog.querySelector("pre")!
    expect(text.textContent).toBe(componentLicenses)
    expect(text.childElementCount).toBe(0)
    for(const name of Object.keys({...dependencies, ...devDependencies})) {
      expect(text.textContent).toContain(`${name} `)
    }
    expect(text.textContent).toContain("Permission is hereby granted")
    dialog.querySelector<HTMLButtonElement>("button")!.click()
    expect(dialog.open).toBe(false)
    link.click()
    expect(dialog.open).toBe(true)
    panel.remove()
    expect(dialog.open).toBe(false)
  })

  it("persists user snippets in their saved order and ignores malformed stored entries", () => {
    const userSnippets = [{id: "new", label: "New", html: "<p>New</p>"}, {id: "old", label: "Old", html: "<p>Old</p>"}]
    persistAppSettings({...defaultAppSettings(), userSnippets})
    expect(loadAppSettings().userSnippets).toEqual(userSnippets)
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...defaultAppSettings(), userSnippets: [null, {}, {id: "broken"}, ...userSnippets]}))
    expect(loadAppSettings().userSnippets).toEqual(userSnippets)
  })
  it("roundtrips local dictionary words and cleans malformed entries", () => {
    const settings = {...defaultAppSettings(), proofreadingDictionary: ["WebWriter", "HTML"]}
    persistAppSettings(settings)
    expect(loadAppSettings().proofreadingDictionary).toEqual(["WebWriter", "HTML"])
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...settings,
      proofreadingDictionary: ["  Word ", "word", "", 3, null, " Another "]}))
    expect(loadAppSettings().proofreadingDictionary).toEqual(["Word", "Another"])
  })

  it("loads, persists, and changes the global spell-checking preference", async () => {
    const defaults = defaultAppSettings()
    expect(defaults.disableSpellChecking).toBe(false)
    for(const value of [undefined, null, "true", 1, {}]) {
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({disableSpellChecking: value}))
      expect(loadAppSettings().disableSpellChecking).toBe(false)
    }
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({disableSpellChecking: true}))
    expect(loadAppSettings().disableSpellChecking).toBe(true)

    const settings = {...defaultAppSettings(), disableSpellChecking: false, language: "de", proofreadingDictionary: ["WebWriter"]}
    persistAppSettings(settings)
    expect(loadAppSettings().disableSpellChecking).toBe(false)
    const panel = await mountPanel(settings)
    const changes: AppSettings[] = []
    panel.addEventListener("settings-change", event => changes.push((event as CustomEvent<AppSettings>).detail))
    const root = panel.shadowRoot!
    const checkbox = root.querySelector<HTMLInputElement>('section[aria-label="Spell checking"] input')!
    expect(root.querySelector("section[aria-label=\"Local dictionary\"] input")).not.toBeNull()
    expect(root.textContent).toContain("Disable spelling, grammar, and style suggestions.")
    checkbox.checked = true
    checkbox.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(changes.at(-1)).toMatchObject({disableSpellChecking: true, language: "de", proofreadingDictionary: ["WebWriter"]})
    expect(changes.at(-1)?.shortcuts).toEqual(settings.shortcuts)
    persistAppSettings(changes.at(-1)!)
    expect(loadAppSettings()).toMatchObject({disableSpellChecking: true, language: "de", proofreadingDictionary: ["WebWriter"]})
  })

  it("adds, removes, and clears local dictionary words through settings changes", async () => {
    const panel = await mountPanel()
    const changes: AppSettings[] = []
    panel.addEventListener("settings-change", event => changes.push((event as CustomEvent<AppSettings>).detail))
    const root = panel.shadowRoot!
    const input = root.querySelector<HTMLInputElement>('input[aria-label="Add dictionary word"]')!
    input.value = " WebWriter "
    input.closest("form")!.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}))
    await panel.updateComplete
    expect(changes.at(-1)?.proofreadingDictionary).toEqual(["WebWriter"])
    expect(root.textContent).toContain("WebWriter")
    expect(root.querySelector(".dictionary-word span")!.textContent).toBe("WebWriter")
    root.querySelector<HTMLButtonElement>('button[aria-label="Remove WebWriter"]')!.click()
    await panel.updateComplete
    expect(changes.at(-1)?.proofreadingDictionary).toEqual([])
    for(const word of ["one", "two"]) {
      input.value = word
      input.closest("form")!.dispatchEvent(new Event("submit", {bubbles: true, cancelable: true}))
      await panel.updateComplete
    }
    const clear = [...root.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent === "Clear dictionary")!
    clear.click()
    await panel.updateComplete
    expect(changes.at(-1)?.proofreadingDictionary).toEqual([])
  })
  it.each([true, false])("assigns unique shortcuts to every general command (Apple: %s)", apple => {
    const settings = defaultAppSettings(apple)
    const commands = appCommands.filter(command => !["Table", "Graphic"].includes(command.section))
    const shortcuts = commands.map(command => settings.shortcuts[command.id])
    expect(shortcuts.every(Boolean)).toBe(true)
    expect(new Set(shortcuts).size).toBe(shortcuts.length)
    for(const shortcut of shortcuts) expect(reservedShortcutReason(shortcut, apple)).toBe("")
    for(const [id, key, code] of [["text.increase", ">", "Period"], ["text.decrease", "<", "Comma"]]) {
      expect(shortcutMatchesEvent(settings.shortcuts[id], new KeyboardEvent("keydown", {
        key, code, shiftKey: true, metaKey: apple, ctrlKey: !apple,
      }))).toBe(true)
    }
  })

  it("upgrades missing defaults once without replacing custom bindings or re-enabling cleared shortcuts", () => {
    const settings = defaultAppSettings()
    settings.shortcuts["document.new"] = ""
    settings.shortcuts["document.open"] = "Alt+F"
    settings.shortcuts["document.download"] = ""
    settings.shortcuts["document.save"] = defaultAppSettings().shortcuts["document.download"]
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({...settings, shortcutsVersion: 1}))
    const loaded = loadAppSettings()
    expect(loaded.shortcuts["document.new"]).toBe(defaultAppSettings().shortcuts["document.new"])
    expect(loaded.shortcuts["document.open"]).toBe("Alt+F")
    expect(loaded.shortcuts["document.download"]).toBe("")
    loaded.shortcuts["document.new"] = ""
    persistAppSettings(loaded)
    expect(loadAppSettings().shortcuts["document.new"]).toBe("")
  })

  it("omits removed insertion commands even from saved settings", async () => {
    const ids = ["insert.form", "insert.script", "insert.section"]
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({
      shortcuts: Object.fromEntries(ids.map(id => [id, "Alt+F"])),
    }))
    const settings = loadAppSettings()
    for(const id of ids) {
      expect(appCommands.some(command => command.id === id)).toBe(false)
      expect(settings.shortcuts).not.toHaveProperty(id)
    }
  })

  it("introduces commands, explains the Style tab, and spaces adjacent command sections", async () => {
    const panel = await mountPanel()
    const root = panel.shadowRoot!
    const editorHeading = root.querySelector(".settings-panel")!.firstElementChild!
    expect(editorHeading.localName).toBe("h2")
    expect(editorHeading.textContent).toBe("Editor")
    expect(root.querySelector(".cloud-heading")!.localName).toBe(editorHeading.localName)
    expect(root.textContent).not.toContain("Name shown in")
    expect(root.querySelector("h3")!.textContent).toBe("Commands")
    expect(root.querySelector("h3")!.nextElementSibling!.className).toBe("shortcut-help")
    expect(root.querySelector('[aria-label="Toolbox"] .checkbox-description')!.textContent).toContain("CSS properties")
    const sections = [...root.querySelectorAll<HTMLElement>(".command-section")]
    const gap = parseFloat(getComputedStyle(sections[0].querySelector(".command-list")!).gap)
      * parseFloat(getComputedStyle(document.documentElement).fontSize)
    for(const section of sections.slice(1)) expect(parseFloat(getComputedStyle(section).marginTop)).toBeCloseTo(gap)
  })

  it("drops excluded mark commands and their saved shortcuts", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({
      shortcuts: Object.fromEntries(excludedMarkNames.map(name => [`text.${name}`, "Alt+Shift+M"])),
    }))
    const settings = loadAppSettings()
    for(const name of excludedMarkNames) {
      expect(appCommands.some(command => command.id === `text.${name}`)).toBe(false)
      expect(settings.shortcuts).not.toHaveProperty(`text.${name}`)
    }
  })

  it("defaults motion disabling to off", () => {
    expect(defaultAppSettings().disableAnimations).toBe(false)
  })

  it("defaults new documents to Document and validates saved layout choices", () => {
    expect(defaultAppSettings().defaultLayout).toBe("document")
    for(const value of ["document", "canvas", "slides", "board", "invalid", null]) {
      localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({defaultLayout: value}))
      expect(loadAppSettings().defaultLayout).toBe(value === "canvas" || value === "slides" || value === "board" ? value : "document")
    }
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({defaultTemplate: "slides"}))
    expect(loadAppSettings().defaultLayout).toBe("slides")
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({defaultLayout: "canvas", defaultTemplate: "slides"}))
    expect(loadAppSettings().defaultLayout).toBe("canvas")
  })

  it("changes the default layout while preserving other settings", async () => {
    const settings = {...defaultAppSettings(), language: "de"}
    const panel = await mountPanel(settings)
    const changes: AppSettings[] = []
    panel.addEventListener("settings-change", event => changes.push((event as CustomEvent<AppSettings>).detail))
    const select = panel.shadowRoot!.querySelector<HTMLSelectElement>("#default-layout")!
    expect([...select.options].map(option => option.textContent)).toEqual(["Document", "Canvas", "Slides", "Board"])
    expect(select.value).toBe("document")
    select.value = "board"
    select.dispatchEvent(new Event("change", {bubbles: true}))
    expect(changes.at(-1)).toMatchObject({defaultLayout: "board", language: "de"})
    expect(parseFloat(getComputedStyle(select.closest(".setting-card")!).marginTop))
      .toBe(parseFloat(getComputedStyle(document.documentElement).fontSize))
    panel.resetSettings()
    await panel.updateComplete
    expect(select.value).toBe("document")
  })

  it("emits motion changes while preserving the other settings", async () => {
    const settings = {...defaultAppSettings(), language: "de", updateDocumentLanguage: false}
    const panel = await mountPanel(settings)
    const changes: AppSettings[] = []
    panel.addEventListener("settings-change", event => {
      changes.push((event as CustomEvent<AppSettings>).detail)
    })
    const checkbox = panel.shadowRoot!.querySelector<HTMLInputElement>('section[aria-label="Motion"] input')!

    checkbox.checked = true
    checkbox.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    checkbox.checked = false
    checkbox.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(changes.map(change => change.disableAnimations)).toEqual([true, false])
    expect(changes[0].language).toBe(settings.language)
    expect(changes[0].updateDocumentLanguage).toBe(settings.updateDocumentLanguage)
    expect(changes[0].shortcuts).toEqual(settings.shortcuts)
  })

  it("shows language settings and every application command", async () => {
    const panel = await mountPanel()

    expect(panel.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Interface language"]')!.value)
      .toBe("en")
    expect(panel.shadowRoot!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true)
    expect(panel.shadowRoot!.querySelectorAll(".command-row")).toHaveLength(appCommands.length)
    expect(panel.shadowRoot!.textContent).toContain("Save the active document")
    expect(panel.shadowRoot!.textContent).toContain("Toggle bold formatting")
  })

  it("places element-specific shortcuts in collapsed categories after general commands", async () => {
    const panel = await mountPanel()
    const root = panel.shadowRoot!
    const categories = [...root.querySelectorAll<HTMLDetailsElement>("details.command-category:not(.developer-settings)")]

    expect(categories.map(category => category.querySelector("summary")!.textContent))
      .toEqual(["Table commands", "Graphic commands"])
    expect([...root.querySelector(".settings-panel")!.children].slice(-3, -1)).toEqual(categories)
    for(const [index, section] of ["Table", "Graphic"].entries()) {
      expect(categories[index].open).toBe(false)
      expect([...categories[index].querySelectorAll(".command-label")].map(label => label.textContent))
        .toEqual(appCommands.filter(command => command.section === section).map(command => command.label))
    }
    expect(root.querySelector('section[aria-label="Insert commands"]')!.closest("details")).toBeNull()
  })

  it("edits shortcuts inside an expanded category without collapsing it", async () => {
    const panel = await mountPanel()
    const category = panel.shadowRoot!.querySelector<HTMLDetailsElement>("details.command-category:not(.developer-settings)")!
    category.open = true
    const button = category.querySelector<HTMLButtonElement>("button")!
    button.click()
    await panel.updateComplete
    button.dispatchEvent(shortcutEvent("Alt+Shift+9"))
    await panel.updateComplete

    expect(panel.settings.shortcuts["table.rowAbove"]).toBe("Alt+Shift+9")
    expect(category.open).toBe(true)
    expect(button.textContent).toContain("9")
  })

  it("keeps developer settings collapsed above keyboard shortcuts and preserves expansion while changing settings", async () => {
    const panel = await mountPanel()
    const root = panel.shadowRoot!
    const category = root.querySelector<HTMLDetailsElement>(".developer-settings")!
    const cloudSettings = root.querySelector('[aria-label="Identity and cloud services"]')!
    expect(root.querySelector(".commands-heading")!.previousElementSibling).toBe(cloudSettings)
    expect(cloudSettings.previousElementSibling).toBe(category)
    expect(category.querySelector("summary")!.textContent).toBe("Developer settings")
    expect(category.open).toBe(false)
    expect([...category.querySelectorAll(".checkbox-label")].map(label => label.textContent)).toEqual(["Pin developer console", "Auto-reload packages", "Autosave cloud on bundle change"])
    category.open = true
    category.querySelector<HTMLInputElement>("input")!.click()
    await panel.updateComplete
    expect(panel.settings.pinDeveloperConsole).toBe(true)
    expect(category.open).toBe(true)
  })

  it("swaps an occupied shortcut and explains the change", async () => {
    const panel = await mountPanel()
    const settings = defaultAppSettings()
    let changed: AppSettings | undefined
    panel.addEventListener("settings-change", event => {
      changed = (event as CustomEvent<AppSettings>).detail
    })
    const save = panel.shadowRoot!.querySelector<HTMLButtonElement>(
      'button[aria-label="Configure shortcut for Save"]',
    )!
    save.click()
    await panel.updateComplete
    save.dispatchEvent(shortcutEvent(settings.shortcuts["document.print"]))
    await panel.updateComplete

    expect(changed?.shortcuts["document.save"]).toBe(settings.shortcuts["document.print"])
    expect(changed?.shortcuts["document.print"]).toBe(settings.shortcuts["document.save"])
    expect(panel.shadowRoot!.querySelector(".status")?.textContent).toContain("swapped")
  })

  it("rejects reserved browser shortcuts while continuing to record", async () => {
    const panel = await mountPanel()
    const save = panel.shadowRoot!.querySelector<HTMLButtonElement>(
      'button[aria-label="Configure shortcut for Save"]',
    )!
    save.click()
    await panel.updateComplete
    save.dispatchEvent(new KeyboardEvent("keydown", {
      key: "F4",
      code: "F4",
      altKey: true,
      bubbles: true,
      composed: true,
      cancelable: true,
    }))
    await panel.updateComplete

    expect(panel.shadowRoot!.querySelector(".status")?.textContent).toContain("reserved")
    expect(save.hasAttribute("data-recording")).toBe(true)
  })

  it("resets and persists settings through the ribbon", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "File"
    document.body.append(ribbon)
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    menu.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label: "Settings"}, bubbles: true, composed: true}))
    await ribbon.updateComplete
    const panel = ribbon.shadowRoot!.querySelector<SettingsPanel>("settings-panel")!
    await panel.updateComplete
    const changed = {
      ...defaultAppSettings(),
      language: "de",
      updateDocumentLanguage: false,
      disableAnimations: true,
      showStyleToolbox: true,
      pinDeveloperConsole: true,
      shortcuts: {...defaultAppSettings().shortcuts, "document.save": "Alt+S"},
    }
    panel.dispatchEvent(new CustomEvent("settings-change", {
      detail: changed,
      bubbles: true,
      composed: true,
    }))
    await ribbon.updateComplete

    expect(ribbon.settings).toEqual(changed)
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)!)).toEqual({...changed, shortcutsVersion: 2})

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".reset-settings-button")!.click()
    await panel.updateComplete
    expect(ribbon.settings).toEqual(defaultAppSettings())
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)!)).toEqual({...defaultAppSettings(), shortcutsVersion: 2})
    expect(panel.shadowRoot!.querySelector(".status")?.textContent).toContain("Settings reset")
    expect(ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#settings-dialog")!.open).toBe(true)
  })

  it("loads motion settings compatibly with older and malformed stored values", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({language: "de"}))
    expect(loadAppSettings().disableAnimations).toBe(false)

    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({disableAnimations: "yes"}))
    expect(loadAppSettings().disableAnimations).toBe(false)

    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({disableAnimations: true}))
    expect(loadAppSettings().disableAnimations).toBe(true)
  })
})

describe("settings dialog", () => {
  it("opens from the last option in the file menu below a separator", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#settings-dialog")!

    const items = menu.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item")
    const settings = items[items.length - 1]
    expect(settings.title).toBe("Settings")
    const section = settings.closest("section")!
    expect(section.previousElementSibling).not.toBeNull()
    expect(getComputedStyle(section).borderTopStyle).toBe("solid")
    expect(getComputedStyle(section).borderTopWidth).toBe("1px")
    expect(dialog.open).toBe(false)
    settings.click()
    await ribbon.updateComplete
    expect(dialog.open).toBe(true)
    const panel = dialog.querySelector<SettingsPanel>("settings-panel")!
    await panel.updateComplete
    const nav = dialog.querySelector<HTMLElement>("nav")!
    const main = dialog.querySelector<HTMLElement>("main")!
    const close = nav.querySelector<HTMLButtonElement>(".settings-close-button")!
    expect(nav.querySelector("h2")?.textContent).toBe("Settings")
    expect(close.previousElementSibling?.textContent?.trim()).toBe("Reset settings")
    const versionLabel = close.previousElementSibling?.previousElementSibling!
    expect(versionLabel.textContent?.trim()).toBe(`WebWriter ${version}`)
    expect(getComputedStyle(versionLabel).color).toBe("#687383")
    expect(close.textContent?.trim()).toBe("")
    expect(close.querySelector("svg")).not.toBeNull()
    expect(getComputedStyle(close).borderTopWidth).toBe("0px")
    expect(main.contains(panel)).toBe(true)
    expect(main.contains(nav)).toBe(false)
    expect(getComputedStyle(main).overflowY).toBe("auto")
    expect(getComputedStyle(dialog).overflow).toBe("hidden")
    expect(panel.shadowRoot!.querySelector(".settings-header")).toBeNull()
    expect(panel.shadowRoot!.querySelector(".reset-button")).toBeNull()
    const licenses = panel.shadowRoot!.querySelector<HTMLDialogElement>("#licenses-dialog")!
    panel.shadowRoot!.querySelector<HTMLButtonElement>(".licenses-link")!.click()
    expect(licenses.open).toBe(true)
    licenses.querySelector<HTMLButtonElement>("button")!.click()
    await ribbon.updateComplete
    expect(licenses.open).toBe(false)
    expect(dialog.open).toBe(true)
    expect(["", "none"]).toContain(getComputedStyle(panel.shadowRoot!.querySelector(".setting-card")!).borderTopStyle)
    expect(ribbon.activeMenu).toBe("Start")
    dialog.close()
    expect(dialog.open).toBe(false)
  })
})

it("defaults to hiding Style and loads the saved preference", async () => {
  expect(defaultAppSettings().showStyleToolbox).toBe(false)
  for(const value of [undefined, "yes", true, false]) {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({showStyleToolbox: value}))
    expect(loadAppSettings().showStyleToolbox).toBe(value === true)
  }
  const panel = await mountPanel()
  const changes: AppSettings[] = []
  panel.addEventListener("settings-change", event => changes.push((event as CustomEvent<AppSettings>).detail))
  const checkbox = panel.shadowRoot!.querySelector<HTMLInputElement>('section[aria-label="Toolbox"] input')!
  expect(checkbox.checked).toBe(false)
  checkbox.click()
  expect(changes.at(-1)!.showStyleToolbox).toBe(true)
})


it("defaults to an unpinned console, validates saved settings, and exposes its checkbox", async () => {
  expect(defaultAppSettings().pinDeveloperConsole).toBe(false)
  for(const value of [undefined, "yes", true, false]) {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({pinDeveloperConsole: value}))
    expect(loadAppSettings().pinDeveloperConsole).toBe(value === true)
  }
  const panel = await mountPanel()
  const changes: AppSettings[] = []
  panel.addEventListener("settings-change", event => changes.push((event as CustomEvent<AppSettings>).detail))
  const checkbox = panel.shadowRoot!.querySelector<HTMLInputElement>('section[aria-label="Developer console"] input')!
  expect(checkbox.checked).toBe(false)
  checkbox.click()
  expect(changes.at(-1)!.pinDeveloperConsole).toBe(true)
  persistAppSettings(changes.at(-1)!)
  expect(loadAppSettings().pinDeveloperConsole).toBe(true)
})


it("persists global auto-reload and exposes it under developer console settings", async () => {
  expect(defaultAppSettings().autoReloadPackages).toBe(true)
  for(const value of [undefined, "no", true, false]) {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({autoReloadPackages: value}))
    expect(loadAppSettings().autoReloadPackages).toBe(value !== false)
  }
  const panel = await mountPanel()
  const changes: AppSettings[] = []
  panel.addEventListener("settings-change", event => changes.push((event as CustomEvent<AppSettings>).detail))
  const input = panel.shadowRoot!.querySelectorAll<HTMLInputElement>('section[aria-label="Developer console"] input')[1]
  expect(input.checked).toBe(true)
  input.click()
  expect(changes.at(-1)!.autoReloadPackages).toBe(false)
  persistAppSettings(changes.at(-1)!)
  expect(loadAppSettings().autoReloadPackages).toBe(false)
})


it("offers Disable AI, validates its saved value, and persists the preference", async () => {
  expect(defaultAppSettings().disableAI).toBe(false)
  for(const value of [undefined, "yes", true, false]) {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({disableAI: value}))
    expect(loadAppSettings().disableAI).toBe(value === true)
  }
  const panel = await mountPanel()
  const checkbox = panel.shadowRoot!.querySelector<HTMLInputElement>('section[aria-label="AI"] input')!
  expect(checkbox.checked).toBe(false)
  panel.addEventListener("settings-change", event => persistAppSettings((event as CustomEvent<AppSettings>).detail))
  checkbox.click()
  expect(panel.settings.disableAI).toBe(true)
  expect(loadAppSettings().disableAI).toBe(true)
  checkbox.click()
  expect(loadAppSettings().disableAI).toBe(false)
})


it("keeps cloud bundle autosave off by default and offers a persisted developer setting", async () => {
  expect(defaultAppSettings().autosaveCloudOnBundleChange).toBe(false)
  for(const value of [undefined, "yes", true, false]) {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({autosaveCloudOnBundleChange: value}))
    expect(loadAppSettings().autosaveCloudOnBundleChange).toBe(value === true)
  }
  const panel = await mountPanel()
  const developer = panel.shadowRoot!.querySelector<HTMLDetailsElement>(".developer-settings")!
  expect(developer.open).toBe(false)
  const label = [...developer.querySelectorAll("label")].find(label => label.textContent?.includes("Autosave cloud on bundle change"))!
  const checkbox = label.querySelector<HTMLInputElement>("input")!
  expect(checkbox.checked).toBe(false)
  panel.addEventListener("settings-change", event => persistAppSettings((event as CustomEvent<AppSettings>).detail))
  checkbox.click()
  expect(loadAppSettings().autosaveCloudOnBundleChange).toBe(true)
})

const configuredService = {id: "cloud", type: "url" as const, url: "https://cloud.example", username: "ada"}
const sessionMetadata = {
  kind: "webwriter-cloud-service", version: 1, authentication: "bearer",
  apiBaseUrl: "https://cloud.example/api", signInUrl: "https://cloud.example/api/sign-in",
  collaborationUrl: "wss://cloud.example", adminUrl: "https://cloud.example/admin", capabilities: ["documents"],
  user: {id: "ada", name: "Ada"},
}
const cloudResponse = (value: unknown, status = 200) => new Response(JSON.stringify(value), {status, headers: {"Content-Type": "application/json"}})

describe("identity and cloud settings", () => {
  it("migrates the saved offline username to the local username", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({offlineUsername: "Ada", shortcutsVersion: 2}))
    expect(loadAppSettings().localUsername).toBe("Ada")
    const saved = JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)!)
    expect(saved.localUsername).toBe("Ada")
    expect(saved).not.toHaveProperty("offlineUsername")
  })

  it("prefers the local username when legacy settings also contain an offline username", () => {
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify({localUsername: "", offlineUsername: "Ada", shortcutsVersion: 2}))
    expect(loadAppSettings().localUsername).toBe("")
  })

  it("persists the local name, multiple providers, and only one active provider without passwords", async () => {
    vi.stubGlobal("fetch", vi.fn(async(url: string, init?: RequestInit) => {
      const origin = new URL(url).origin
      const session = {...sessionMetadata, apiBaseUrl: `${origin}/api`, signInUrl: `${origin}/api/sign-in`,
        collaborationUrl: origin.replace(/^http/, "ws"), adminUrl: `${origin}/admin`}
      return cloudResponse(init?.method === "POST" ? {session, accessToken: "access-token"} : {...session, user: null})
    }))
    const panel = await mountPanel()
    panel.addEventListener("settings-change", event => persistAppSettings((event as CustomEvent<AppSettings>).detail))
    const root = panel.shadowRoot!
    const name = root.querySelector<HTMLInputElement>("#local-username")!
    name.value = "Local Ada"
    name.dispatchEvent(new Event("input"))
    const click = (label: string) => [...root.querySelectorAll<HTMLButtonElement>("button")].find(button => button.textContent?.trim() === label)!.click()
    const submitProvider = async () => {
      const form = root.querySelector<HTMLFormElement>(".new-provider")!
      form.querySelector<HTMLInputElement>('[name="username"]')!.value = "ada"
      form.querySelector<HTMLInputElement>('[name="password"]')!.value = "transient-password"
      form.dispatchEvent(new Event("submit", {cancelable: true}))
      await vi.waitFor(() => expect(panel.settings.cloudServices.at(-1)?.accessToken).toBe("access-token"))
      await panel.updateComplete
    }
    click("edumix.eu")
    await panel.updateComplete
    expect(panel.settings.cloudServices).toHaveLength(0)
    await submitProvider()
    click("Custom provider")
    await panel.updateComplete
    const url = root.querySelector<HTMLInputElement>('.new-provider [name="url"]')!
    url.value = "https://cloud.example"
    await submitProvider()
    expect(panel.settings.cloudServices.map(service => service.type)).toEqual(["edumix", "url"])
    const radios = root.querySelectorAll<HTMLInputElement>('input[name="active-cloud"]')
    radios[1].click()
    await panel.updateComplete
    radios[2].click()
    await panel.updateComplete
    expect([...radios].filter(input => input.checked)).toHaveLength(1)
    expect(loadAppSettings().localUsername).toBe("Local Ada")
    expect(loadAppSettings().activeCloudServiceId).toBe(panel.settings.cloudServices[1].id)
    persistAppSettings({...panel.settings, cloudServices: [{...configuredService, password: "secret"} as any]})
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)).not.toContain("secret")
    expect(loadAppSettings().cloudServices[0]).not.toHaveProperty("password")
  })

  it("signs in inside settings, stores the token, selects that provider, and clears the password", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(cloudResponse({...sessionMetadata, user: null}))
      .mockResolvedValueOnce(cloudResponse({session: sessionMetadata, accessToken: "access-token", expiresIn: 3600})))
    const panel = await mountPanel({...defaultAppSettings(), cloudServices: [configuredService]})
    panel.addEventListener("settings-change", event => persistAppSettings((event as CustomEvent<AppSettings>).detail))
    const password = panel.shadowRoot!.querySelector<HTMLInputElement>('input[type="password"]')!
    password.value = "never-store-this"
    panel.shadowRoot!.querySelector(".cloud-service form")!.dispatchEvent(new Event("submit", {cancelable: true}))
    await vi.waitFor(() => expect(loadAppSettings().cloudServices[0].accessToken).toBe("access-token"))
    expect(loadAppSettings().activeCloudServiceId).toBe("cloud")
    expect(password.value).toBe("")
    expect(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)).not.toContain("never-store-this")
    expect(panel.shadowRoot!.textContent).toContain("Signed in")
  })

  it("clears failed credentials and keeps the existing active provider", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(cloudResponse(sessionMetadata))
      .mockResolvedValueOnce(cloudResponse({message: "Invalid credentials"}, 401)))
    const panel = await mountPanel({...defaultAppSettings(), cloudServices: [configuredService]})
    const password = panel.shadowRoot!.querySelector<HTMLInputElement>('input[type="password"]')!
    password.value = "wrong"
    panel.shadowRoot!.querySelector(".cloud-service form")!.dispatchEvent(new Event("submit", {cancelable: true}))
    await vi.waitFor(() => expect(panel.shadowRoot!.querySelector('[role="alert"]')?.textContent).toContain("Invalid credentials"))
    expect(password.value).toBe("")
    expect(panel.settings.activeCloudServiceId).toBeNull()
    expect(panel.settings.cloudServices[0].accessToken).toBeUndefined()
  })

  it("does not transfer a password to another provider when one is removed", async () => {
    const second = {...configuredService, id: "second", url: "https://second.example"}
    const panel = await mountPanel({...defaultAppSettings(), cloudServices: [configuredService, second]})
    const passwords = panel.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="password"]')
    passwords[0].value = "first-secret"
    passwords[1].value = "second-secret"
    panel.shadowRoot!.querySelector<HTMLButtonElement>(".cloud-service > .cloud-remove")!.click()
    await panel.updateComplete
    expect(panel.shadowRoot!.querySelector<HTMLInputElement>('input[type="password"]')!.value).toBe("second-secret")
    panel.remove()
    expect(passwords[1].value).toBe("")
  })
})

it("cancels a settings sign-in when the panel closes and ignores the late result", async () => {
  let complete!: (response: Response) => void
  const pending = new Promise<Response>(resolve => {complete = resolve})
  const fetch = vi.fn().mockResolvedValueOnce(cloudResponse(sessionMetadata)).mockReturnValueOnce(pending)
  vi.stubGlobal("fetch", fetch)
  const panel = await mountPanel({...defaultAppSettings(), cloudServices: [configuredService]})
  const changes = vi.fn()
  panel.addEventListener("settings-change", changes)
  const password = panel.shadowRoot!.querySelector<HTMLInputElement>('input[type="password"]')!
  password.value = "transient-password"
  panel.shadowRoot!.querySelector(".cloud-service form")!.dispatchEvent(new Event("submit", {cancelable: true}))
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
  panel.remove()
  expect(password.value).toBe("")
  expect(fetch.mock.calls[1][1].signal.aborted).toBe(true)
  complete(cloudResponse({session: sessionMetadata, accessToken: "late-token"}))
  await pending
  await new Promise(resolve => setTimeout(resolve, 0))
  expect(changes).not.toHaveBeenCalled()
  expect(panel.settings.cloudServices[0].accessToken).toBeUndefined()
})

it("reveals the selected provider form, clears credentials when switching or cancelling, and reuses the app icon", async () => {
  const panel = await mountPanel({...defaultAppSettings(), cloudServices: [{...configuredService, type: "edumix", url: "https://edumix.eu"}]})
  const root = panel.shadowRoot!
  const choices = root.querySelectorAll<HTMLButtonElement>('[role="group"][aria-label="Provider type"] button')
  expect(choices).toHaveLength(2)
  expect(root.querySelector(".new-provider")).toBeNull()
  expect(root.querySelector<HTMLImageElement>(".cloud-service-header img")!.getAttribute("src")).toBe("/assets/app-icon-transparent.svg")
  const remove = root.querySelector<HTMLButtonElement>(".cloud-remove")!
  expect(remove.textContent).toBe("×")
  expect(remove.getAttribute("aria-label")).toBe("Remove edumix.eu")
  choices[0].click()
  await panel.updateComplete
  expect(choices[0].getAttribute("aria-pressed")).toBe("true")
  expect(root.querySelector('.new-provider [name="url"]')).toBeNull()
  expect(root.textContent).not.toContain("Passwords are never saved")
  root.querySelector<HTMLInputElement>('.new-provider [name="password"]')!.value = "discard-on-switch"
  choices[1].click()
  await panel.updateComplete
  expect(choices[0].getAttribute("aria-pressed")).toBe("false")
  expect(choices[1].getAttribute("aria-pressed")).toBe("true")
  expect(root.querySelector('.new-provider [name="url"]')).not.toBeNull()
  expect(root.querySelector<HTMLInputElement>('.new-provider [name="password"]')!.value).toBe("")
  root.querySelector<HTMLInputElement>('.new-provider [name="password"]')!.value = "discard-on-cancel"
  root.querySelector<HTMLButtonElement>('.new-provider button[type="button"]')!.click()
  await panel.updateComplete
  expect(root.querySelector(".new-provider")).toBeNull()
  expect(choices[1].getAttribute("aria-pressed")).toBe("false")
  expect(panel.settings.cloudServices).toHaveLength(1)
  remove.click()
  await panel.updateComplete
  expect(panel.settings.cloudServices).toHaveLength(0)
})

it("keeps the local username beside Local and disables it while a cloud service is selected", async () => {
  const panel = await mountPanel({...defaultAppSettings(), localUsername: "Local Ada", cloudServices: [configuredService], activeCloudServiceId: configuredService.id})
  const root = panel.shadowRoot!
  const local = root.querySelector<HTMLInputElement>('.local-settings input[type="radio"]')!
  const username = root.querySelector<HTMLInputElement>("#local-username")!
  expect(local.closest("label")!.textContent?.trim()).toBe("Local")
  expect(username.getAttribute("aria-label")).toBe("Local username")
  expect(local.closest(".local-settings")!.contains(username)).toBe(true)
  expect(username.value).toBe("Local Ada")
  expect(username.disabled).toBe(true)
  local.click()
  await panel.updateComplete
  expect(username.disabled).toBe(false)
  username.value = "Another name"
  username.dispatchEvent(new Event("input"))
  root.querySelector<HTMLInputElement>('.cloud-service input[type="radio"]')!.click()
  await panel.updateComplete
  expect(username.disabled).toBe(true)
  expect(username.value).toBe("Another name")
})

it("allows a dev-server display name without exposing password or sign-in controls", async () => {
  const service = {...configuredService, url: "http://localhost:1234/api", username: "Local developer", authentication: "none" as const}
  const panel = await mountPanel({...defaultAppSettings(), cloudServices: [service], activeCloudServiceId: service.id})
  panel.addEventListener("settings-change", event => persistAppSettings((event as CustomEvent<AppSettings>).detail))
  const card = panel.shadowRoot!.querySelector(".cloud-service")!
  const username = card.querySelector<HTMLInputElement>('[name="username"]')!
  expect(username.value).toBe("Local developer")
  expect(card.querySelector('input[type="password"]')).toBeNull()
  expect(card.querySelector('button[type="submit"]')).toBeNull()
  username.value = "Dev Ada"
  username.dispatchEvent(new Event("input"))
  await panel.updateComplete
  expect(loadAppSettings().cloudServices[0].username).toBe("Dev Ada")
  expect(loadAppSettings().activeCloudServiceId).toBe(service.id)
})
