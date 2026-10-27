// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {RibbonButton} from "./ribbon-button"
import type {RibbonMenu} from "./ribbon-menu"

afterEach(() => {
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

describe("ribbon button dropdown positioning", () => {
  it("converts the fixed CSS inset for root gutters while keeping the join in client coordinates", async () => {
    const root = document.documentElement
    const viewportWidth = window.innerWidth
    const leadingGutter = 15
    const clientViewportWidth = viewportWidth - leadingGutter
    const clientWidth = vi.spyOn(root, "clientWidth", "get").mockReturnValue(clientViewportWidth)
    const getComputedStyle = vi.spyOn(window, "getComputedStyle")
    const originalGetComputedStyle = getComputedStyle.getMockImplementation()!
    getComputedStyle.mockImplementation(element => element === root
      ? {scrollbarGutter: "stable both-edges"} as CSSStyleDeclaration
      : originalGetComputedStyle(element))

    const button = new RibbonButton()
    Object.assign(button, {label: "Paragraph", action: "element:p", submenu: ["Heading 1"]})
    document.body.append(button)
    await button.updateComplete
    const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
    row.getBoundingClientRect = () => new DOMRect(120, 100, 90, 28)
    const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const menu = button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    menu.getBoundingClientRect = () => new DOMRect(120, 127, 200, 80)

    trigger.click()
    await button.updateComplete
    await menu.updateComplete
    await Promise.resolve()

    expect(clientWidth).toHaveBeenCalled()
    expect(menu.style.left).toBe(`${120 - leadingGutter}px`)
    expect(menu.style.getPropertyValue("--ribbon-menu-join-left")).toBe("1px")
    expect(menu.style.getPropertyValue("--ribbon-menu-join-width")).toBe("88px")
    button.closeSubmenu()
  })

  it("clamps against the root client width and converts only the fixed inset at the right edge", async () => {
    const root = document.documentElement
    const viewportWidth = window.innerWidth
    const leadingGutter = 15
    const clientViewportWidth = viewportWidth - leadingGutter
    const clientWidth = vi.spyOn(root, "clientWidth", "get").mockReturnValue(clientViewportWidth)
    const getComputedStyle = vi.spyOn(window, "getComputedStyle")
    const originalGetComputedStyle = getComputedStyle.getMockImplementation()!
    getComputedStyle.mockImplementation(element => element === root
      ? {scrollbarGutter: "stable both-edges"} as CSSStyleDeclaration
      : originalGetComputedStyle(element))

    const button = new RibbonButton()
    Object.assign(button, {label: "Paragraph", action: "element:p", submenu: ["Heading 1"]})
    document.body.append(button)
    await button.updateComplete
    const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
    const triggerLeft = clientViewportWidth - 70
    const triggerWidth = 60
    row.getBoundingClientRect = () => new DOMRect(triggerLeft, 100, triggerWidth, 28)
    const trigger = button.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const menu = button.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    const menuWidth = 200
    menu.getBoundingClientRect = () => new DOMRect(0, 127, menuWidth, 80)

    trigger.click()
    await button.updateComplete
    await menu.updateComplete
    await Promise.resolve()

    const clientLeft = Math.max(8, clientViewportWidth - menuWidth - 8)
    expect(clientWidth).toHaveBeenCalled()
    expect(menu.style.minWidth).toBe(`${triggerWidth}px`)
    expect(menu.style.left).toBe(`${clientLeft - leadingGutter}px`)
    expect(menu.style.getPropertyValue("--ribbon-menu-join-left")).toBe(`${triggerLeft - clientLeft + 1}px`)
    expect(clientLeft + parseFloat(menu.style.getPropertyValue("--ribbon-menu-join-left"))).toBe(triggerLeft + 1)
    button.closeSubmenu()
  })
})
