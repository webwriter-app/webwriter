// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

beforeEach(() => document.body.replaceChildren())

describe("list ribbon drawer", () => {
  it("appears in both Start and Insert with all semantic list controls", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete

    const labels = () => Array.from(ribbon.shadowRoot!.querySelectorAll(
      'ribbon-drawer[label="Lists"] ribbon-button',
    )).map(button => button.getAttribute("label"))
    expect(labels()).toEqual(["Bulleted List", "Numbered List", "Description List", "Details"])
    expect(ribbon.shadowRoot!.querySelector(
      'ribbon-drawer[label="Lists"] ribbon-button[label="Details"]',
    )?.shadowRoot?.querySelector(".icon-tabler-circle-chevron-right")).not.toBeNull()

    ribbon.activeMenu = "Insert"
    await ribbon.updateComplete
    expect(labels()).toEqual(["Bulleted List", "Numbered List", "Description List", "Details"])
  })

  it("indicates the active type and exposes inline marker style actions", async () => {
    const ribbon = new AppRibbon()
    ribbon.listType = "ol"
    ribbon.listStyle = "upper-roman"
    document.body.append(ribbon)
    await ribbon.updateComplete

    const ordered = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Lists"] ribbon-button[label="Numbered List"]',
    )!
    const unordered = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Lists"] ribbon-button[label="Bulleted List"]',
    )!
    expect(ordered.active).toBe(true)
    expect(unordered.active).toBe(false)
    expect(ordered.submenu.map(item => typeof item === "string" ? item : item.action))
      .toContain("list-style:ol:upper-roman")
    expect(unordered.submenu.map(item => typeof item === "string" ? item : item.action))
      .toContain("list-style:ul:square")
  })

  it("dispatches a toggle action from the active list button", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)

    const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Lists"] ribbon-button[label="Bulleted List"]',
    )!
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "toggle-list:ul", keepDrawerOpen: false},
    }))
  })
})
