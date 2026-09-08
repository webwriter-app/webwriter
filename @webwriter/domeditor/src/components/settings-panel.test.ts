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
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    menu.dispatchEvent(new CustomEvent("ribbon-button-click", {detail: {label: "Settings"}, bubbles: true, composed: true}))
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

    ribbon.shadowRoot!.querySelector<HTMLButtonElement>(".reset-settings-button")!.click()
    await panel.updateComplete
    expect(ribbon.settings).toEqual(defaultAppSettings())
    expect(JSON.parse(localStorage.getItem(APP_SETTINGS_STORAGE_KEY)!)).toEqual(defaultAppSettings())
    expect(panel.shadowRoot!.querySelector(".status")?.textContent).toContain("Settings reset")
    expect(ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#settings-dialog")!.open).toBe(true)
  })
})

describe("settings dialog", () => {
  it("opens from the first option in the file menu", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    const dialog = ribbon.shadowRoot!.querySelector<HTMLDialogElement>("#settings-dialog")!

    expect(menu.groups[0].buttons[0]).toEqual({label: "Settings"})
    expect(dialog.open).toBe(false)
    menu.shadowRoot!.querySelector<HTMLButtonElement>(".item")!.click()
    await ribbon.updateComplete
    expect(dialog.open).toBe(true)
    const panel = dialog.querySelector<SettingsPanel>("settings-panel")!
    await panel.updateComplete
    const nav = dialog.querySelector<HTMLElement>("nav")!
    const main = dialog.querySelector<HTMLElement>("main")!
    const close = nav.querySelector<HTMLButtonElement>(".settings-close-button")!
    expect(nav.querySelector("h2")?.textContent).toBe("Settings")
    expect(close.previousElementSibling?.textContent?.trim()).toBe("Reset settings")
    expect(close.textContent?.trim()).toBe("")
    expect(close.querySelector("svg")).not.toBeNull()
    expect(getComputedStyle(close).borderTopWidth).toBe("0px")
    expect(main.contains(panel)).toBe(true)
    expect(main.contains(nav)).toBe(false)
    expect(getComputedStyle(main).overflowY).toBe("auto")
    expect(getComputedStyle(dialog).overflow).toBe("hidden")
    expect(panel.shadowRoot!.querySelector(".settings-header")).toBeNull()
    expect(panel.shadowRoot!.querySelector(".reset-button")).toBeNull()
    expect(["", "none"]).toContain(getComputedStyle(panel.shadowRoot!.querySelector(".setting-card")!).borderTopStyle)
    expect(ribbon.activeMenu).toBe("Start")
    dialog.close()
    expect(dialog.open).toBe(false)
  })
})
