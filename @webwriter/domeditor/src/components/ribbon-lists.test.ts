// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import {insertionMenuItems} from "./insertion-menu"

beforeEach(() => document.body.replaceChildren())

describe("list ribbon drawer", () => {
  it("condenses the element controls on Start while keeping Insert detailed", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete

    const elements = ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Elements"]')!
    expect(Array.from(elements.querySelectorAll("ribbon-button"), button => button.getAttribute("label")))
      .toEqual(["Prose", "Lists", "Media"])
    expect(elements.querySelector<RibbonButton>('ribbon-button[label="Prose"]')?.submenu.map(item =>
      typeof item === "string" ? item : item.label,
    )).toEqual(["Paragraph", "Heading"])
    const condensedLists = elements.querySelector<RibbonButton>('ribbon-button[label="Lists"]')?.submenu ?? []
    expect(condensedLists.map(item =>
      typeof item === "string" ? item : item.label,
    )).toEqual(["List", "Details"])
    const condensedList = condensedLists.find(item => typeof item !== "string" && item.label === "List")
    expect(typeof condensedList === "string" ? [] : condensedList?.submenu?.map(item =>
      typeof item === "string" ? item : item.label,
    )).toContain("Enumeration")
    expect(typeof condensedList === "string" ? [] : condensedList?.submenu?.map(item =>
      typeof item === "string" ? item : item.label,
    )).toContain("Glossary")
    expect(elements.querySelector<RibbonButton>('ribbon-button[label="Media"]')?.submenu.map(item =>
      typeof item === "string" ? item : item.label,
    )).toEqual(["Table", "Image", "Graphic", "Audio", "Website", "Video", "Formula", "Form", "Section", "Script"])

    ribbon.activeMenu = "Insert"
    await ribbon.updateComplete
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(
      'ribbon-drawer[label="Text"] ribbon-button',
    )).map(button => button.getAttribute("label"))).toEqual(["Paragraph", "Section", "Heading", "Details"])
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(
      'ribbon-drawer[label="Lists"] ribbon-button',
    )).map(button => button.getAttribute("label"))).toEqual(["List", "Table"])
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(
      'ribbon-drawer[label="Media"] ribbon-button',
    )).map(button => button.getAttribute("label"))).toEqual(["Image", "Graphic", "Audio", "Website", "Video", "Formula"])
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(
      'ribbon-drawer[label="Interactive"] ribbon-button',
    )).map(button => button.getAttribute("label"))).toEqual(["Form", "Script"])
  })

  it("groups form, section, script, divider, and dialog insertions under their primary buttons", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const submenuTags = (button: RibbonButton) => button.submenu.map(entry => {
      const label = typeof entry === "string" ? entry : entry.label
      return insertionMenuItems.find(item => item.name === label)?.tag
    })
    const button = (drawer: string, label: string) => ribbon.shadowRoot!.querySelector<RibbonButton>(
      `ribbon-drawer[label="${drawer}"] ribbon-button[label="${label}"]`,
    )!

    expect(submenuTags(button("Interactive", "Form"))).toEqual([
      "button", "input", "select", "meter", "datalist", "fieldset", "form", "label", "legend", "optgroup", "option", "output", "progress",
    ])
    expect(submenuTags(button("Text", "Section"))).toEqual([
      "div", "blockquote", "article", "aside", "header", "footer", "main", "nav", "search", "address",
    ])
    expect(submenuTags(button("Interactive", "Script"))).toEqual(["script", "style", "canvas", "template", "slot"])
    expect(submenuTags(button("Text", "Heading"))).toEqual(["h2", "h3", "h4", "h5", "h6", "hr"])
    expect(submenuTags(button("Text", "Details"))).toEqual(["dialog"])
  })

  it("renders the Text and Interactive controls as standalone dropdown buttons on Insert", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const text = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Text"]')!
    const interactive = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Interactive"]')!
    const buttons = [
      ...Array.from(text.querySelectorAll<RibbonButton>("ribbon-button:not([label=\"Paragraph\"])")),
      ...Array.from(interactive.querySelectorAll<RibbonButton>("ribbon-button")),
    ]
    await Promise.all([text.updateComplete, interactive.updateComplete, ...buttons.map(button => button.updateComplete)])

    expect(text.layoutWidths.expanded).toBe(148)
    expect(interactive.layoutWidths.expanded).toBe(84)
    for(const button of buttons) {
      expect(button.shadowRoot!.querySelector('.submenu-trigger[aria-haspopup="menu"]')).not.toBeNull()
    }
  })

  it("merges enumeration into List while preserving every list style action", async () => {
    const ribbon = new AppRibbon()
    ribbon.listType = "ol"
    ribbon.listStyle = "upper-roman"
    ribbon.activeMenu = "Insert"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const list = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Lists"] ribbon-button[label="List"]',
    )!
    const enumeration = list.submenu.find(item => typeof item !== "string" && item.action === "toggle-list:ol")
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Lists"] ribbon-button[label="Enumeration"]')).toBeNull()
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
    ribbon.activeMenu = "Insert"
    ribbon.listType = "dl"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const lists = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Lists"]')!
    const list = lists.querySelector<RibbonButton>('ribbon-button[label="List"]')!
    expect(lists.querySelector('ribbon-button[label="Glossary"]')).toBeNull()
    expect(list.submenu).toContainEqual({label: "Glossary", action: "toggle-list:dl", icon: "Glossary"})
    expect(list.active).toBe(true)
  })

  it("dispatches Enumeration from the merged List dropdown", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Insert"
    document.body.append(ribbon)
    await ribbon.updateComplete
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)

    const list = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Lists"] ribbon-button[label="List"]',
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
      'ribbon-drawer[label="Elements"] ribbon-button[label="Lists"]',
    )!
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "toggle-list:ul", keepDrawerOpen: false},
    }))
  })
})
