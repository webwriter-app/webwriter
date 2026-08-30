// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {
  APP_SETTINGS_STORAGE_KEY,
  appCommands,
  defaultAppSettings,
  type AppSettings,
} from "../app-settings"
import {AppRibbon} from "./ribbon"
import {SettingsPanel} from "./settings-panel"
import type {RibbonDrawer} from "./ribbon-drawer"

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
  document.body.replaceChildren()
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
})

describe("settings panel", () => {
  it("shows language settings and every application command", async () => {
    const panel = await mountPanel()

    expect(panel.shadowRoot!.querySelector<HTMLSelectElement>('select[aria-label="Interface language"]')!.value)
      .toBe("en")
    expect(panel.shadowRoot!.querySelector<HTMLInputElement>('input[type="checkbox"]')!.checked).toBe(true)
    expect(panel.shadowRoot!.querySelectorAll(".command-row")).toHaveLength(appCommands.length)
    expect(panel.shadowRoot!.textContent).toContain("Save the active document")
    expect(panel.shadowRoot!.textContent).toContain("Toggle bold formatting")
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
    const panel = ribbon.shadowRoot!.querySelector<SettingsPanel>("settings-panel")!
    await panel.updateComplete
    const changed = {
      ...defaultAppSettings(),
      language: "de",
      updateDocumentLanguage: false,
      shortcuts: {...defaultAppSettings().shortcuts, "document.save": "Alt+S"},
    }
    panel.dispatchEvent(new CustomEvent("settings-change", {
      detail: changed,
      bubbles: true,
      composed: true,
    }))
    await ribbon.updateComplete

    expect(ribbon.settings).toEqual(changed)
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)!)).toEqual(changed)

    panel.shadowRoot!.querySelector<HTMLButtonElement>(".reset-button")!.click()
    await panel.updateComplete
    expect(ribbon.settings).toEqual(defaultAppSettings())
  })
})

describe("settings drawer", () => {
  it("stays narrow to the left of File and opens as a pullout", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "File"
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawers = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonDrawer>(".ribbon-content > ribbon-drawer"))
    const settings = drawers[0]
    await settings.updateComplete

    expect(drawers.map(drawer => drawer.label)).toEqual(["Settings", "File", "Sharing", "Metadata"])
    expect(settings.collapsed).toBe(true)
    expect(settings.shadowRoot!.querySelector(".summary-label")).not.toBeNull()
    expect(getComputedStyle(settings.shadowRoot!.querySelector(".summary-label")!).display).toBe("none")

    settings.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    await settings.updateComplete
    expect(settings.hasAttribute("drawer-open")).toBe(true)
    expect(settings.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.getAttribute("aria-expanded"))
      .toBe("true")
  })
})
