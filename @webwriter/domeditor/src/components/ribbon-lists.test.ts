// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {formElementTypes} from "../form"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import {deliberatelyUnsupportedInsertionTags, insertionMenuItems} from "./insertion-menu"

beforeEach(() => document.body.replaceChildren())

describe("list ribbon drawer", () => {
  it("shows all element insertion controls in one drawer on Start", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete

    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(".ribbon-content > ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label")))
      .toEqual(["Marks", "Elements", "Packages"])
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(
      'ribbon-drawer[label="Elements"] ribbon-button:not([slot="compact"])',
    )).map(button => button.getAttribute("label"))).toEqual([
      "Paragraph", "Heading", "List",
      "Details", "Table",
      "Image", "Graphic", "Audio", "Website", "Video",
    ])
  })

  it("groups element insertions at the intermediate drawer width", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const elements = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    elements.compact = true
    await elements.updateComplete
    const primaryControls = elements.shadowRoot!.querySelector<HTMLElement>(".elements-primary-controls")!
    const defaultSlot = elements.shadowRoot!.querySelector<HTMLSlotElement>('slot:not([name])')!
    const compactSlot = elements.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="compact"]')!
    const buttons = Array.from(elements.querySelectorAll<RibbonButton>('ribbon-button[slot="compact"]'))
    const button = (label: string) => buttons.find(candidate => candidate.label === label)!

    expect(elements.layoutWidths.compact).toBe(128)
    expect(defaultSlot.hidden).toBe(true)
    expect(compactSlot.hidden).toBe(false)
    expect(buttons.map(candidate => candidate.label)).toEqual(["Text", "Media", "Table", "Details"])
    expect(getComputedStyle(primaryControls).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
    expect(button("Text").submenu.map(item => typeof item === "string" ? item : item.label))
      .toEqual(["Paragraph", "Heading", "List"])
    expect(button("Media").submenu.map(item => typeof item === "string" ? item : item.label))
      .toEqual([
        "Image", "Audio", "Video", "Graphic", "Website",
      ])
    expect(button("Details").action).toBe("insert-details")
    expect(button("Details").icon).toBe("Details")
    expect(button("Media").action).toBe("Image")
    expect(button("Media").dropdownOnClick).toBe(false)

    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    await button("Media").updateComplete
    button("Media").shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await button("Media").updateComplete
    const menu = button("Media").shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    expect(button("Media").shadowRoot!.querySelector(".submenu-trigger")!.getAttribute("aria-expanded")).toBe("true")
    expect(menu.hidden).toBe(false)
    menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Image"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "Image"},
    }))
    await button("Details").updateComplete
    button("Details").shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener.mock.calls.at(-1)![0].detail.label).toBe("insert-details")
  })

  it("groups heading insertions without dialog, form or HTML controls", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const submenuTags = (button: RibbonButton) => button.submenu.map(entry => {
      const label = typeof entry === "string" ? entry : entry.label
      return insertionMenuItems.find(item => item.name === label)?.tag
    })
    const button = (drawer: string, label: string) => ribbon.shadowRoot!.querySelector<RibbonButton>(
      `ribbon-drawer[label="${drawer}"] ribbon-button[label="${label}"]`,
    )!

    expect(button("Elements", "Form")).toBeNull()
    expect(button("Elements", "HTML")).toBeNull()
    expect(button("Elements", "Script")).toBeNull()
    expect(submenuTags(button("Elements", "Heading"))).toEqual(["h2", "h3", "h4", "h5", "h6"])
    expect(insertionMenuItems.find(item => item.tag === "hgroup")).toBeUndefined()
    expect(submenuTags(button("Elements", "Details"))).toEqual([])
    expect(deliberatelyUnsupportedInsertionTags).toEqual(["canvas", "template", "slot", "dialog", "hgroup", "hr", "dl", ...formElementTypes])
    expect(insertionMenuItems.filter(item => (
      item.tag && (deliberatelyUnsupportedInsertionTags as readonly string[]).includes(item.tag)
    ))).toEqual([])
  })


  it("renders the element controls with their appropriate expansion buttons on Start", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const elements = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const buttons = ["Heading", "Details"].map(label =>
      elements.querySelector<RibbonButton>(`ribbon-button[label="${label}"]`)!,
    )
    await Promise.all([elements.updateComplete, ...buttons.map(button => button.updateComplete)])

    expect(elements.layoutWidths.expanded).toBeCloseTo(298.4)
    expect(getComputedStyle(elements.shadowRoot!.querySelector<HTMLElement>(".elements-primary-controls")!).gridTemplateColumns)
      .toBe("repeat(5, minmax(0, 1fr))")
    for(const button of buttons.filter(button => button.label === "Heading")) {
      expect(button.shadowRoot!.querySelector('.submenu-trigger[aria-haspopup="menu"]')).not.toBeNull()
    }
    expect(buttons.find(button => button.label === "Details")!.shadowRoot!
      .querySelector(".submenu-trigger")).toBeNull()

  })

  it("merges enumeration into List while preserving every list style action", async () => {
    const ribbon = new AppRibbon()
    ribbon.listType = "ol"
    ribbon.listStyle = "upper-roman"
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const list = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="List"]',
    )!
    const enumeration = list.submenu.find(item => typeof item !== "string" && item.action === "toggle-list:ol")
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Elements"] ribbon-button[label="Enumeration"]')).toBeNull()
    expect(list.active).toBe(true)
    expect(typeof enumeration === "string" ? [] : enumeration?.submenu?.map(item => typeof item === "string" ? item : item.action))
      .toContain("list-style:ol:upper-roman")
    expect(list.submenu.map(item => typeof item === "string" ? item : item.action))
      .toContain("list-style:ul:square")
    expect(list.submenu.map(item => typeof item === "string" ? item : item.action))
      .not.toContain("toggle-list:menu")
    expect(list.submenu.map(item => typeof item === "string" ? item : item.action))
      .not.toContain("toggle-list:dl")
  })

  it("shows native ordered-list and direct item controls in Edit", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.listType = "ol"
    ribbon.orderedList = {start: "4", reversed: true, numbering: "I", itemValue: "9"}
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="List"]')!
    expect(drawer).not.toBeNull()
    expect(Array.from(drawer.querySelectorAll("label > span")).map(label => label.textContent))
      .toEqual(["Start at", "Numbering", "Count backwards", "Item number"])

    const changed = vi.fn()
    ribbon.addEventListener("list-attribute-change", changed)
    const start = drawer.querySelector<HTMLInputElement>('input[type="number"]')!
    start.value = "6"
    start.dispatchEvent(new Event("change"))
    expect(changed).toHaveBeenCalledWith(expect.objectContaining({detail: {name: "start", value: "6"}}))
  })

  it("omits Glossary insertion while marking List active for an existing glossary", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.listType = "dl"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const lists = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const list = lists.querySelector<RibbonButton>('ribbon-button[label="List"]')!
    expect(lists.querySelector('ribbon-button[label="Glossary"]')).toBeNull()
    expect(list.submenu).not.toContainEqual({label: "Glossary", action: "toggle-list:dl", icon: "Glossary"})
    expect(list.active).toBe(true)
  })

  it("dispatches Enumeration from the merged List dropdown", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)

    const list = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="List"]',
    )!
    await list.updateComplete
    list.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await list.updateComplete
    const menu = list.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Enumeration"]')!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: expect.objectContaining({label: "toggle-list:ol"}),
    }))
  })

  it("dispatches a toggle action from the active list button", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)

    const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="List"]',
    )!
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "toggle-list:ul", keepDrawerOpen: false},
    }))
  })
})
