// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import {RibbonMenu} from "./ribbon-menu"
import {primaryDrawerMarkNames} from "../marks"

afterEach(() => document.body.replaceChildren())

async function mount() {
  const ribbon = new AppRibbon()
  ribbon.expanded = false
  document.body.append(ribbon)
  await ribbon.updateComplete
  ribbon.shadowRoot!.querySelector('ribbon-tab[label="File"]')!.dispatchEvent(new CustomEvent("ribbon-tab-select", {detail: {label: "File"}, bubbles: true}))
  await ribbon.updateComplete
  const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
  await menu.updateComplete
  expect(menu.hidden).toBe(false)
  return {ribbon, menu}
}

async function open(menu: RibbonMenu, label: string) {
  menu.shadowRoot!.querySelector<HTMLButtonElement>(`button[title="${label}"]`)!.click()
  await menu.updateComplete
  const nested = menu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
  await nested.updateComplete
  return nested
}

describe("collapsed ribbon file menu", () => {
  it("shows a grey empty hint and updates the Open submenu with up to ten recent documents", async () => {
    const {ribbon, menu} = await mount()
    const commands = vi.fn()
    ribbon.addEventListener("ribbon-button-click", commands)
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show more Open options"]')!.click()
    await menu.updateComplete
    const hint = menu.shadowRoot!.querySelector<HTMLButtonElement>('.submenu button')!
    expect(hint.textContent?.trim()).toBe("No recently opened documents")
    expect(hint.disabled).toBe(true)
    expect(commands).not.toHaveBeenCalled()
    ribbon.recentDocuments = Array.from({length: 12}, (_, index) => ({id: `doc/${index}`, title: `Lesson ${index}`}))
    await ribbon.updateComplete
    await menu.updateComplete
    const entries = [...menu.shadowRoot!.querySelectorAll<HTMLButtonElement>('.submenu button')]
    expect(entries).toHaveLength(10)
    expect(entries.map(button => button.title)).toEqual(ribbon.recentDocuments.slice(0, 10).map(document => document.title))
    entries[0].click()
    expect(commands.mock.calls[0][0].detail.label).toBe("recent-document:doc%2F0")
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector(".submenu")).toBeNull()
  })

  it.each(["Document", "Canvas", "Slides"])("dispatches New %s from the submenu", async label => {
    const {ribbon, menu} = await mount()
    const commands = vi.fn()
    ribbon.addEventListener("ribbon-button-click", commands)
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show more New options"]')!.click()
    await menu.updateComplete
    const options = Array.from(menu.shadowRoot!.querySelectorAll<HTMLButtonElement>('.submenu button'))
    expect(options.map(button => button.textContent!.trim())).toEqual(["Document", "Canvas", "Slides"])
    options.find(button => button.title === label)!.click()
    expect(commands).toHaveBeenCalledOnce()
    expect(commands.mock.calls[0][0].detail.label).toBe(`new:${label.toLowerCase()}`)
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector(".submenu")).toBeNull()
  })

  it("can dismiss menus before they mount", () => {
    expect(() => new RibbonMenu().closeSubmenus()).not.toThrow()
  })

  it("shows editing menus only while collapsed and outside preview", async () => {
    const {ribbon, menu} = await mount()
    expect(menu.groups.flatMap(group => group.buttons).map(button => typeof button === "string" ? button : button.label))
      .toEqual(["New", "Open", "Save", "Save as", "Format", "Insert", "Packages", "Hide breadcrumb", "Developer console", "Settings"])
    ribbon.expanded = true
    await ribbon.updateComplete
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('[title="Format"]')).toBeNull()
    ribbon.expanded = false
    ribbon.previewActive = true
    await ribbon.updateComplete
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('[title="Insert"]')).toBeNull()
    expect(menu.shadowRoot!.querySelector('[title="Hide breadcrumb"]')).toBeNull()
    expect(menu.shadowRoot!.querySelector('[title="Developer console"]')).toBeNull()
    ribbon.settings = {...ribbon.settings, pinDeveloperConsole: true}
    await ribbon.updateComplete
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector('[title="Developer console"]')).not.toBeNull()
  })

  it("flattens marks into three sections and dispatches existing commands", async () => {
    const {ribbon, menu} = await mount()
    ribbon.canMark = true
    await ribbon.updateComplete
    await menu.updateComplete
    const format = await open(menu, "Format")
    expect(format.groups.map(group => group.label)).toEqual(["Font", "Standard marks", "More marks"])
    expect(format.shadowRoot!.querySelectorAll("section")).toHaveLength(3)
    expect(format.shadowRoot!.querySelector('ribbon-combobox[name="font-family"]')).not.toBeNull()
    expect(format.shadowRoot!.querySelector('ribbon-combobox[name="font-size"]')).not.toBeNull()
    expect(format.groups[1].buttons.map(button => typeof button === "string" ? button : button.action))
      .toEqual(primaryDrawerMarkNames.map(name => `mark:${name}`))
    const commands = vi.fn()
    ribbon.addEventListener("ribbon-button-click", commands)
    format.shadowRoot!.querySelector<HTMLButtonElement>('[title="Increase font size"]')!.click()
    expect(commands.mock.calls[0][0].detail.label).toBe("increaseFontSize")
  })

  it("opens insertion options recursively and closes only the innermost menu on Escape", async () => {
    const {ribbon, menu} = await mount()
    const insert = await open(menu, "Insert")
    const toggle = insert.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show more Heading options"]')!
    toggle.click()
    await insert.updateComplete
    const submenu = insert.shadowRoot!.querySelector<HTMLElement>('.submenu')!
    expect(submenu.textContent).toContain("Heading")
    submenu.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true}))
    await insert.updateComplete
    expect(insert.shadowRoot!.querySelector(".submenu")).toBeNull()
    expect(menu.shadowRoot!.querySelector(".submenu")).not.toBeNull()
    toggle.click()
    await insert.updateComplete
    const commands = vi.fn()
    ribbon.addEventListener("ribbon-button-click", commands)
    insert.shadowRoot!.querySelector<HTMLButtonElement>('.submenu button')!.click()
    expect(commands).toHaveBeenCalledOnce()
  })
})
