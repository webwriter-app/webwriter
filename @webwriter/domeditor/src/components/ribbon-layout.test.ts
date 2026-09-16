// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {AppRibbon} from "./ribbon"
import {RibbonDrawer} from "./ribbon-drawer"
import {RibbonButton} from "./ribbon-button"

afterEach(() => {
  document.body.replaceChildren()
})

async function mountRibbon() {
  const ribbon = new AppRibbon()
  document.body.append(ribbon)
  await ribbon.updateComplete
  return ribbon
}

describe("layout preset ribbon", () => {
  it("replaces Section with Layouts and opens the drawer from its expansion button", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const opener = drawer.querySelector<RibbonButton>('ribbon-button.layout-opener:not([slot="compact"])')!
    await Promise.all([drawer.updateComplete, opener.updateComplete])
    expect(drawer.querySelector('ribbon-button[label="Section"]')).toBeNull()
    expect(drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.hidden).toBe(true)
    opener.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(opener.shadowRoot!.querySelector("ribbon-menu")).toBeNull()
    expect(drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.hidden).toBe(false)
    document.dispatchEvent(new KeyboardEvent("keydown", {key: "Escape"}))
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.hidden).toBe(true)
    expect(opener.shadowRoot!.activeElement).toBe(opener.shadowRoot!.querySelector(".submenu-trigger"))
  })

  it("offers Layouts in compact mode and preserves the responsive collapsed opener", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    drawer.compact = true
    await drawer.updateComplete
    const opener = drawer.querySelector<RibbonButton>('ribbon-button.layout-opener[slot="compact"]')!
    await opener.updateComplete
    opener.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    drawer.closeDrawer()
    drawer.collapsed = true
    await drawer.updateComplete
    expect(drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.hidden).toBe(false)
  })

  it("places custom layout controls after all presets", async () => {
    const ribbon = await mountRibbon()
    const gallery = ribbon.shadowRoot!.querySelector('.layout-gallery')!
    expect(gallery.lastElementChild!.getAttribute("aria-label")).toBe("Custom layout")
    expect(gallery.lastElementChild!.querySelector('select[aria-label="Section type"]')).not.toBeNull()
  })

  it("renders four named, keyboard-activatable layout presets", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const gallery = drawer.querySelector<HTMLElement>(".layout-gallery")!
    const presets = Array.from(gallery.querySelectorAll<HTMLButtonElement>(".layout-preset"))

    expect(presets).toHaveLength(4)
    expect(gallery.querySelector(".layout-preset-kind")).toBeNull()
    expect(presets.every(button => button.type === "button")).toBe(true)
    expect(presets.map(button => button.querySelector(".layout-preset-name")?.textContent?.trim())).toEqual([
      "Two columns",
      "Three columns",
      "Grid",
      "Cards",
    ])
    expect(presets.every(button => button.getAttribute("aria-label")?.startsWith("Insert "))).toBe(true)
    expect(AppRibbon.styles.toString()).toMatch(
      /\.layout-gallery\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit, minmax\(min\(9rem, 100%\), 1fr\)\);/,
    )
  })

  it("keeps the insertion header in its own region above the gallery", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!

    drawer.openDrawer(true)
    await drawer.updateComplete
    const primary = drawer.shadowRoot!.querySelector(".elements-primary-controls")
    const gallery = drawer.shadowRoot!.querySelector(".elements-gallery-controls")

    expect(primary).not.toBeNull()
    expect(gallery).not.toBeNull()
    expect(primary!.querySelector("slot[name=more]")).toBeNull()
    expect(gallery!.querySelector("slot[name=more]")).not.toBeNull()
    expect(getComputedStyle(primary!).flexBasis).toBe("5.625rem")
  })

  it("emits the existing insertion action while leaving the pullout open", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const eventPromise = new Promise<CustomEvent<{label: string, keepDrawerOpen?: boolean}>>(resolve => {
      ribbon.addEventListener("ribbon-button-click", event => resolve(event as CustomEvent<{
        label: string
        keepDrawerOpen?: boolean
      }>), {once: true})
    })
    const preset = drawer.querySelector<HTMLButtonElement>(".layout-preset")!

    drawer.openDrawer(true)
    await drawer.updateComplete
    preset.click()
    const event = await eventPromise

    expect(event.detail).toEqual({label: "layout-insert:two-columns", keepDrawerOpen: true})
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
  })

  it("closes a sibling pullout when another ribbon drawer opens", async () => {
    const first = new RibbonDrawer()
    const second = new RibbonDrawer()
    first.label = "Elements"
    second.label = "Packages"
    first.expandable = true
    second.expandable = true
    document.body.append(first, second)
    await Promise.all([first.updateComplete, second.updateComplete])

    const closeOthers = (event: Event) => {
      const source = event.composedPath().find(target => target instanceof RibbonDrawer)
      if(!(event as CustomEvent<{open?: boolean}>).detail?.open) return
      for(const drawer of [first, second]) if(drawer !== source) drawer.closeDrawer()
    }
    first.addEventListener("ribbon-drawer-state-change", closeOthers)
    second.addEventListener("ribbon-drawer-state-change", closeOthers)

    first.openDrawer(true)
    await first.updateComplete
    second.openDrawer(true)
    await Promise.all([first.updateComplete, second.updateComplete])

    expect(first.hasAttribute("drawer-open")).toBe(false)
    expect(second.hasAttribute("drawer-open")).toBe(true)
  })
})

it.each(["grid", "flex", "columns"] as const)("marks both Layouts buttons active inside %s", async kind => {
  const ribbon = await mountRibbon()
  ribbon.layout = {kind, item: true, columns: {tracks: null, automatic: 0, reason: null}, rows: {tracks: null, automatic: 0, reason: null}, style: {target: null, inline: {}, computed: {}, context: {display: "block", parentDisplay: "block"}}}
  await ribbon.updateComplete
  const buttons = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>(".layout-opener"))
  expect(buttons).toHaveLength(2)
  expect(buttons.every(button => button.active)).toBe(true)
  expect(Array.from(ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".layout-preset")).every(button => button.disabled)).toBe(true)
  ribbon.layout = null
  await ribbon.updateComplete
  expect(buttons.every(button => !button.active)).toBe(true)
  expect(Array.from(ribbon.shadowRoot!.querySelectorAll<HTMLButtonElement>(".layout-preset")).every(button => !button.disabled)).toBe(true)
})
