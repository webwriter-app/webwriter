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
  it("keeps the Elements opener across the full two-row control grid", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const opener = drawer.querySelector<HTMLElement>(".layout-opener")!

    expect(drawer.expandable).toBe(true)
    expect(opener.getAttribute("label")).toBe("Layouts")
    expect(AppRibbon.styles.toString()).toMatch(
      /ribbon-button\.layout-opener\s*\{[\s\S]*?grid-row:\s*1 \/ 3;/,
    )
    expect(RibbonButton.styles.toString()).toMatch(
      /:host\(\.layout-opener\) \.button-row\s*\{[\s\S]*?height:\s*100%;/,
    )
  })

  it("keeps Layouts behind the compact drawer chevron", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    drawer.compact = true
    await drawer.updateComplete

    expect(drawer.querySelector('ribbon-button[label="Layouts"][slot="compact"]')).toBeNull()
    const primary = drawer.shadowRoot!.querySelector<HTMLElement>(".elements-primary-controls")!
    expect(getComputedStyle(primary).gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))")
  })

  it("hides the redundant Layouts opener in a collapsed Elements drawer", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    drawer.collapsed = true
    await drawer.updateComplete

    const opener = drawer.querySelector<HTMLElement>("ribbon-button.layout-opener")!
    expect(opener).not.toBeNull()
    expect(drawer.shadowRoot!.querySelector<HTMLSlotElement>("slot:not([name])")!.hidden).toBe(false)
    expect(RibbonDrawer.styles.toString()).toMatch(
      /:host\(\[layout="elements"\]\[collapsed\]\) \.elements-primary-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(6, minmax\(0, 1fr\)\);/,
    )
    expect(RibbonDrawer.styles.toString()).toMatch(
      /:host\(\[layout="elements"\]\[collapsed\]\) ::slotted\(ribbon-button\.layout-opener\)\s*\{[\s\S]*?display:\s*none;/,
    )
  })

  it("renders eight named, keyboard-activatable layout presets", async () => {
    const ribbon = await mountRibbon()
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    const gallery = drawer.querySelector<HTMLElement>(".layout-gallery")!
    const presets = Array.from(gallery.querySelectorAll<HTMLButtonElement>(".layout-preset"))

    expect(presets).toHaveLength(8)
    expect(presets.every(button => button.type === "button")).toBe(true)
    expect(presets.map(button => button.querySelector(".layout-preset-name")?.textContent?.trim())).toEqual([
      "Two columns",
      "Three columns",
      "Sidebar left",
      "Sidebar right",
      "Four panels",
      "Vertical stack",
      "Horizontal row",
      "Wrapping cards",
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
    expect(getComputedStyle(primary!).flexBasis).toContain("px")
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
