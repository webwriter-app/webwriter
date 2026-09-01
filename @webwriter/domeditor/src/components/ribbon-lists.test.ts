// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import {insertionMenuItems} from "./insertion-menu"

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
      "Paragraph", "Section", "Heading", "Details",
      "List", "Table",
      "Image", "Graphic", "Audio", "Website", "Video", "Formula",
      "Form", "Script",
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
    const controls = elements.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const defaultSlot = elements.shadowRoot!.querySelector<HTMLSlotElement>('slot:not([name])')!
    const compactSlot = elements.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="compact"]')!
    const buttons = Array.from(elements.querySelectorAll<RibbonButton>('ribbon-button[slot="compact"]'))
    const button = (label: string) => buttons.find(candidate => candidate.label === label)!

    expect(elements.layoutWidths.compact).toBe(128)
    expect(defaultSlot.hidden).toBe(true)
    expect(compactSlot.hidden).toBe(false)
    expect(buttons.map(candidate => candidate.label)).toEqual(["Text", "Media", "Table", "Other"])
    expect(getComputedStyle(controls).gridTemplateColumns).toBe("repeat(2, minmax(0, 1fr))")
    expect(button("Text").submenu.map(item => typeof item === "string" ? item : item.label))
      .toEqual(["Paragraph", "Section", "Heading", "List"])
    expect(button("Media").submenu.map(item => typeof item === "string" ? item : item.label))
      .toEqual(["Image", "Audio", "Video", "Graphic", "Formula", "Website"])
    expect(button("Other").submenu.map(item => typeof item === "string" ? item : item.label))
      .toEqual(["Form", "Script", "Details"])
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
  })

  it("groups form, script, divider, and dialog insertions under their primary buttons", async () => {
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

    expect(submenuTags(button("Elements", "Form"))).toEqual([
      "fieldset", "label", "input", "textarea", "select", "datalist", "button", "output", "meter", "progress",
    ])
    expect(submenuTags(button("Elements", "Script"))).toEqual(["script", "style", "canvas", "template", "slot"])
    expect(submenuTags(button("Elements", "Heading"))).toEqual(["h2", "h3", "h4", "h5", "h6", "hr"])
    expect(submenuTags(button("Elements", "Details"))).toEqual(["dialog"])
  })

  it("uses a native select for the section type dropdown", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.canSection = true
    document.body.append(ribbon)
    await ribbon.updateComplete

    const section = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Section"]',
    )!
    await section.updateComplete
    section.shadowRoot!.querySelector<HTMLButtonElement>('.submenu-trigger[aria-haspopup="dialog"]')!.click()
    await section.updateComplete

    const select = section.shadowRoot!.querySelector<HTMLSelectElement>("select[aria-label='Type']")!
    expect(select).not.toBeNull()
    expect(Array.from(select.options).map(option => option.value)).toEqual([
      "section", "div", "blockquote", "article", "aside", "header", "footer", "main", "nav", "search", "address",
    ])
  })

  it("renders the grouped element controls as standalone dropdown buttons on Start", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const elements = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const buttons = ["Section", "Heading", "Details", "Form", "Script"].map(label =>
      elements.querySelector<RibbonButton>(`ribbon-button[label="${label}"]`)!,
    )
    await Promise.all([elements.updateComplete, ...buttons.map(button => button.updateComplete)])

    expect(elements.layoutWidths.expanded).toBe(412)
    expect(getComputedStyle(elements.shadowRoot!.querySelector<HTMLElement>(".controls")!).gridAutoColumns).toBe("3.5rem")
    for(const button of buttons.filter(button => button.label !== "Section")) {
      expect(button.shadowRoot!.querySelector('.submenu-trigger[aria-haspopup="menu"]')).not.toBeNull()
    }
    expect(buttons.find(button => button.label === "Section")!.shadowRoot!
      .querySelector('.submenu-trigger[aria-haspopup="dialog"]')).not.toBeNull()
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
      .toContain("toggle-list:menu")
    expect(list.submenu.map(item => typeof item === "string" ? item : item.action))
      .toContain("toggle-list:dl")
  })

  it("shows Glossary only in the List dropdown and marks List active for a glossary", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.listType = "dl"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const lists = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const list = lists.querySelector<RibbonButton>('ribbon-button[label="List"]')!
    expect(lists.querySelector('ribbon-button[label="Glossary"]')).toBeNull()
    expect(list.submenu).toContainEqual({label: "Glossary", action: "toggle-list:dl", icon: "Glossary"})
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
