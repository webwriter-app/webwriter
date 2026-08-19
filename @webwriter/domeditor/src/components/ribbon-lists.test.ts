// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
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
    expect(elements.querySelector<RibbonButton>('ribbon-button[label="Lists"]')?.submenu.map(item =>
      typeof item === "string" ? item : item.label,
    )).toEqual(["List", "Enumeration", "Glossary", "Details"])
    expect(elements.querySelector<RibbonButton>('ribbon-button[label="Media"]')?.submenu.map(item =>
      typeof item === "string" ? item : item.label,
    )).toEqual(["Table", "Image", "Graphic", "Audio", "Video", "Website", "Formula", "Form", "Section"])

    ribbon.activeMenu = "Insert"
    await ribbon.updateComplete
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll(
      'ribbon-drawer[label="Lists"] ribbon-button',
    )).map(button => button.getAttribute("label"))).toEqual(["List", "Enumeration", "Glossary", "Details"])
  })

  it("groups form, section, divider, and dialog insertions under their primary buttons", async () => {
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

    expect(submenuTags(button("Media", "Form"))).toEqual([
      "button", "input", "select", "meter", "datalist", "fieldset", "form", "label", "legend", "optgroup", "option", "output", "progress",
    ])
    expect(submenuTags(button("Media", "Section"))).toEqual([
      "div", "blockquote", "article", "aside", "header", "footer", "main", "nav", "search", "address",
    ])
    expect(submenuTags(button("Text", "Heading"))).toEqual(["h2", "h3", "h4", "h5", "h6", "hr"])
    expect(submenuTags(button("Lists", "Details"))).toEqual(["dialog"])
  })

  it("indicates the active type and exposes inline marker style actions", async () => {
    const ribbon = new AppRibbon()
    ribbon.listType = "ol"
    ribbon.listStyle = "upper-roman"
    ribbon.activeMenu = "Insert"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const ordered = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Lists"] ribbon-button[label="Enumeration"]',
    )!
    const unordered = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Lists"] ribbon-button[label="List"]',
    )!
    expect(ordered.active).toBe(true)
    expect(unordered.active).toBe(false)
    expect(ordered.submenu.map(item => typeof item === "string" ? item : item.action))
      .toContain("list-style:ol:upper-roman")
    expect(unordered.submenu.map(item => typeof item === "string" ? item : item.action))
      .toContain("list-style:ul:square")
    expect(unordered.submenu.map(item => typeof item === "string" ? item : item.action))
      .toContain("toggle-list:menu")
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
