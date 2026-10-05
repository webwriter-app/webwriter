// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {APP_SETTINGS_STORAGE_KEY, appCommands, defaultAppSettings, formatShortcut, loadAppSettings, persistAppSettings} from "../app-settings"
import {AppRibbon} from "./ribbon"
import {SettingsPanel} from "./settings-panel"
import type {RibbonButton} from "./ribbon-button"
import {RibbonMenu} from "./ribbon-menu"
import {insertionMenuGroups} from "./ribbon-menu-config"
import {elementDragType, ribbonInsertionDragType} from "./insertion-menu"

const insertionShortcuts = [
  ["Heading", "heading", "1"],
  ["Details", "details", "2"],
  ["List", "list", "3"],
  ["Table", "table", "4"],
  ["Image", "image", "5"],
  ["Graphic", "graphic", "6"],
  ["Audio", "audio", "7"],
  ["Website", "website", "8"],
  ["Video", "video", "9"],
  ["Formula", "formula", "0"],
] as const

afterEach(() => {
  document.body.replaceChildren()
  localStorage.removeItem(APP_SETTINGS_STORAGE_KEY)
})

function saveLegacySettings() {
  const settings = defaultAppSettings()
  for(const [, id] of insertionShortcuts) settings.shortcuts[`insert.${id}`] = ""
  localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  return settings
}

async function mountRibbon(settings = defaultAppSettings(false)) {
  const ribbon = new AppRibbon()
  ribbon.activeMenu = "Start"
  ribbon.settings = settings
  document.body.append(ribbon)
  await ribbon.updateComplete
  const buttons = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>(
    'ribbon-drawer[label="Elements"] ribbon-button',
  ))
  await Promise.all(buttons.map(button => button.updateComplete))
  return ribbon
}

describe("insertion ribbon shortcuts", () => {
  it("drags ribbon elements and dropdown entries with their icon and tag", async () => {
    const ribbon = await mountRibbon()
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Paragraph"]')!
    const main = button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    const image = vi.spyOn(DataTransfer.prototype, "setDragImage").mockImplementation(() => {})
    const drag = (target: Element) => {
      const data = new DataTransfer()
      const event = new Event("dragstart", {bubbles: true, cancelable: true, composed: true})
      Object.assign(event, {dataTransfer: data})
      target.dispatchEvent(event)
      return data
    }
    expect(main.getAttribute("draggable")).toBe("true")
    const down = new MouseEvent("mousedown", {bubbles: true, cancelable: true, composed: true})
    main.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    const paragraphData = drag(main)
    expect(paragraphData.getData(elementDragType)).toBe("p")
    expect(paragraphData.getData(ribbonInsertionDragType)).toBe("element:p")
    expect(image.mock.calls.at(-1)?.[0]).toBe(main.querySelector(".button-icon"))
    const paragraphIconData = drag(main.querySelector(".button-icon svg path")!)
    expect(paragraphIconData.getData(elementDragType)).toBe("p")
    expect(paragraphIconData.getData(ribbonInsertionDragType)).toBe("element:p")
    expect(paragraphIconData.effectAllowed).toBe("copy")
    const headingButton = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Elements"] ribbon-button[label="Heading"]')!
    const headingMain = headingButton.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    expect(headingMain.getAttribute("draggable")).toBe("true")
    expect(drag(headingMain).getData(elementDragType)).toBe("h1")
    const formulaButton = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Formula"]')!
    await formulaButton.updateComplete
    const formulaMain = formulaButton.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    expect(formulaMain.getAttribute("draggable")).toBe("true")
    expect(drag(formulaMain).getData(ribbonInsertionDragType)).toBe("element:math")

    const menu = new RibbonMenu()
    menu.groups = insertionMenuGroups
    document.body.append(menu)
    await menu.updateComplete
    const headingToggle = menu.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Heading options"]')!
    const headingItem = headingToggle.previousElementSibling as HTMLButtonElement
    expect(headingItem.getAttribute("draggable")).toBe("true")
    expect(drag(headingItem).getData(elementDragType)).toBe("h1")
    headingToggle.click()
    await menu.updateComplete
    const heading2 = Array.from(menu.shadowRoot!.querySelectorAll<HTMLButtonElement>(".submenu button.item"))
      .find(item => item.textContent?.trim() === "Heading 2")!
    expect(heading2.getAttribute("draggable")).toBe("true")
    expect(drag(heading2).getData(elementDragType)).toBe("h2")
    const headingIconData = drag(heading2.querySelector(".item-icon svg path")!)
    expect(headingIconData.getData(elementDragType)).toBe("h2")
    expect(headingIconData.getData(ribbonInsertionDragType)).toBe("element:h2")
    expect(image.mock.calls.at(-1)?.[0]).toBe(heading2.querySelector(".item-icon"))
  })
  it("upgrades saved empty defaults in both tooltips and configurable shortcuts", async () => {
    saveLegacySettings()
    const settings = loadAppSettings()
    const ribbon = await mountRibbon(settings)
    const panel = new SettingsPanel()
    panel.settings = settings
    document.body.append(panel)
    await panel.updateComplete

    for(const [label, id] of insertionShortcuts) {
      const shortcut = defaultAppSettings().shortcuts[`insert.${id}`]
      expect(settings.shortcuts[`insert.${id}`]).toBe(shortcut)
      const button = ribbon.shadowRoot!.querySelector<RibbonButton>(`ribbon-button[label="${label}"]`)!
      expect(button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.title)
        .toBe(`${label} (${formatShortcut(shortcut)})`)
      expect(panel.shadowRoot!.querySelector(`button[aria-label="Configure shortcut for ${label}"] kbd`)).not.toBeNull()
    }
    expect(loadAppSettings()).toEqual(settings)
  })

  it("preserves custom assignments and avoids assigning an occupied shortcut during migration", () => {
    const settings = saveLegacySettings()
    settings.shortcuts["insert.heading"] = "Alt+H"
    settings.shortcuts["document.save"] = defaultAppSettings().shortcuts["insert.image"]
    localStorage.setItem(APP_SETTINGS_STORAGE_KEY, JSON.stringify(settings))
    const loaded = loadAppSettings()
    expect(loaded.shortcuts["insert.heading"]).toBe("Alt+H")
    expect(loaded.shortcuts["document.save"]).toBe(settings.shortcuts["document.save"])
    expect(loaded.shortcuts["insert.image"]).toBe("")
    expect(loaded.shortcuts["insert.formula"]).toBe(defaultAppSettings().shortcuts["insert.formula"])
  })

  it("keeps shortcuts disabled after migration across reloads", () => {
    saveLegacySettings()
    const settings = loadAppSettings()
    settings.shortcuts["insert.heading"] = ""
    persistAppSettings(settings)
    expect(loadAppSettings().shortcuts["insert.heading"]).toBe("")
    expect(loadAppSettings().shortcuts["insert.heading"]).toBe("")
  })

  it.each([true, false])("uses the numbered %s-platform defaults", async applePlatform => {
    const settings = defaultAppSettings(applePlatform)
    const commandById = new Map(appCommands.map(command => [command.id, command]))
    const ribbon = await mountRibbon(settings)
    const elements = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Elements"]')!

    for(const [label, id, key] of insertionShortcuts) {
      const command = commandById.get(`insert.${id}`)!
      expect(command.defaultShortcut?.(applePlatform)).toBe(`${applePlatform ? "Meta" : "Ctrl"}+${key}`)
      expect(settings.shortcuts[command.id]).toBe(`${applePlatform ? "Meta" : "Ctrl"}+${key}`)
      const button = ribbon.shadowRoot!.querySelector<RibbonButton>(`ribbon-button[label="${label}"]`)!
      const main = button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
      expect(main.title).toBe(`${label} (${formatShortcut(settings.shortcuts[command.id])})`)
    }

    expect(elements.querySelector<RibbonButton>('ribbon-button[label="Paragraph"]')
      ?.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.title).toBe(`Paragraph (${formatShortcut(settings.shortcuts["insert.paragraph"])})`)
    expect(elements.querySelector('ribbon-button[label="Section"]')).toBeNull()
    expect(settings.shortcuts["insert.paragraph"]).toBe("Alt+Shift+Enter")
    expect(settings.shortcuts).not.toHaveProperty("insert.section")
    expect(elements.querySelector('ribbon-button[label="Layouts"]')).toBeNull()
  })

  it("uses changed configured shortcuts in insertion tooltips", async () => {
    const settings = defaultAppSettings(false)
    settings.shortcuts["insert.heading"] = "Alt+Shift+H"
    settings.shortcuts["insert.image"] = "Ctrl+Alt+I"
    const ribbon = await mountRibbon(settings)
    const elements = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Elements"]')!

    for(const [label, id] of [["Heading", "heading"], ["Image", "image"]] as const) {
      const button = ribbon.shadowRoot!.querySelector<RibbonButton>(`ribbon-button[label="${label}"]`)!
      const main = button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
      expect(main.title).toBe(`${label} (${formatShortcut(settings.shortcuts[`insert.${id}`])})`)
    }
  })
})
