// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {DomEditorBreadcrumb, type DocumentTreeItem} from "./breadcrumb"
import "./document-head-editor"
import {RibbonButton} from "./ribbon-button"
import {RibbonMenu} from "./ribbon-menu"

afterEach(() => document.body.replaceChildren())

describe("component accessibility contracts", () => {
  it("disables both halves of a disabled split ribbon button", async () => {
    const button = new RibbonButton()
    button.label = "Insert"
    button.submenu = ["Paragraph"]
    button.disabled = true
    document.body.append(button)
    await button.updateComplete

    expect(button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.disabled).toBe(true)
    expect(button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.disabled).toBe(true)
  })

  it("connects an editable combobox to its listbox and active option", async () => {
    const combobox = document.createElement("document-head-combobox")
    combobox.label = "Language"
    combobox.options = [
      {value: "en", label: "English"},
      {value: "de", label: "German"},
    ]
    document.body.append(combobox)
    await combobox.updateComplete

    combobox.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await combobox.updateComplete
    const input = combobox.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))
    await combobox.updateComplete

    const listbox = combobox.shadowRoot!.querySelector<HTMLElement>('[role="listbox"]')!
    expect(input.getAttribute("aria-controls")).toBe(listbox.id)
    expect(input.getAttribute("aria-activedescendant")).toBe(`${listbox.id}-option-0`)
    expect(combobox.shadowRoot!.getElementById(`${listbox.id}-option-0`)).not.toBeNull()
  })

  it("gives each combobox instance a distinct listbox id", async () => {
    const first = document.createElement("document-head-combobox")
    const second = document.createElement("document-head-combobox")
    first.options = [{value: "en", label: "English"}]
    second.options = [{value: "de", label: "German"}]
    document.body.append(first, second)
    await Promise.all([first.updateComplete, second.updateComplete])

    first.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    second.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click()
    await Promise.all([first.updateComplete, second.updateComplete])

    const firstInput = first.shadowRoot!.querySelector("input")!
    const secondInput = second.shadowRoot!.querySelector("input")!
    const firstListbox = first.shadowRoot!.querySelector('[role="listbox"]')!
    const secondListbox = second.shadowRoot!.querySelector('[role="listbox"]')!
    expect(firstListbox.id).not.toBe(secondListbox.id)
    expect(firstInput.getAttribute("aria-controls")).toBe(firstListbox.id)
    expect(secondInput.getAttribute("aria-controls")).toBe(secondListbox.id)
  })

  it("supports arrow-key focus movement within ribbon menus", async () => {
    const menu = new RibbonMenu()
    menu.groups = [{label: "Insert", buttons: ["Paragraph", "Heading"]}]
    document.body.append(menu)
    await menu.updateComplete

    const items = Array.from(menu.shadowRoot!.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'))
    items[0].focus()
    items[0].dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true}))

    expect(menu.shadowRoot!.activeElement).toBe(items[1])
  })

  it("closes a nested ribbon submenu with Escape and restores its trigger", async () => {
    const menu = new RibbonMenu()
    menu.groups = [{label: "Insert", buttons: [{label: "Text", submenu: ["Plain", "Rich"]}]}]
    document.body.append(menu)
    await menu.updateComplete

    const toggle = menu.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-toggle")!
    toggle.click()
    await menu.updateComplete
    const submenuItem = menu.shadowRoot!.querySelector<HTMLButtonElement>(".submenu .item")!
    expect(menu.shadowRoot!.activeElement).toBe(submenuItem)

    submenuItem.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true, composed: true}))
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector(".submenu")).toBeNull()
    expect(menu.shadowRoot!.activeElement).toBe(toggle)
  })

  it("keeps arrow-key navigation inside a nested ribbon submenu", async () => {
    const menu = new RibbonMenu()
    menu.groups = [{label: "Insert", buttons: [{label: "Text", submenu: ["Plain", "Rich"]}]}]
    document.body.append(menu)
    await menu.updateComplete

    menu.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-toggle")!.click()
    await menu.updateComplete
    const items = Array.from(menu.shadowRoot!.querySelectorAll<HTMLButtonElement>(".submenu .item"))
    expect(items.map(item => item.tabIndex)).toEqual([0, -1])

    items[0].dispatchEvent(new KeyboardEvent("keydown", {key: "ArrowDown", bubbles: true, composed: true}))
    expect(menu.shadowRoot!.activeElement).toBe(items[1])
  })

  it("restores focus to a ribbon submenu trigger when Escape closes the popover", async () => {
    const button = new RibbonButton()
    button.label = "Insert"
    button.submenu = ["Paragraph"]
    document.body.append(button)
    await button.updateComplete

    const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    trigger.click()
    await button.updateComplete
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape", bubbles: true}))
    await button.updateComplete

    expect(button.shadowRoot!.querySelector("ribbon-menu")!.hasAttribute("hidden")).toBe(true)
    expect(button.shadowRoot!.activeElement).toBe(trigger)
  })

  it("uses native list and button semantics for the document hierarchy", async () => {
    const tree: DocumentTreeItem = {
      name: "body",
      path: [],
      children: [{name: "paragraph", path: [0], children: []}],
    }
    const breadcrumb = new DomEditorBreadcrumb()
    breadcrumb.tree = tree
    breadcrumb.treeOpen = true
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete

    const list = breadcrumb.shadowRoot!.querySelector<HTMLElement>("#document-tree")!
    expect(list.getAttribute("role")).toBeNull()
    expect(list.getAttribute("aria-label")).toBe("Document tree")
    expect(list.querySelector<HTMLButtonElement>(".tree-item")).not.toBeNull()
    expect(list.querySelector('[role="treeitem"]')).toBeNull()
  })

  it("marks only the active breadcrumb tree trigger as expanded", async () => {
    const breadcrumb = new DomEditorBreadcrumb()
    breadcrumb.path = [
      {name: "body", path: [], icon: "Document"},
      {name: "section", path: [0], icon: "Article"},
    ]
    breadcrumb.tree = {
      name: "body",
      path: [],
      children: [
        {name: "section", path: [0], children: [{name: "paragraph", path: [0, 0], children: []}]},
      ],
    }
    document.body.append(breadcrumb)
    await breadcrumb.updateComplete

    const initialToggles = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".separator-trigger"))
    expect(initialToggles).toHaveLength(2)
    initialToggles[1].click()
    await breadcrumb.updateComplete

    const toggles = Array.from(breadcrumb.shadowRoot!.querySelectorAll<HTMLButtonElement>(".separator-trigger"))
    expect(toggles[0].getAttribute("aria-expanded")).toBe("false")
    expect(toggles[1].getAttribute("aria-expanded")).toBe("true")
  })
})
