// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {AppRibbon} from "./ribbon"
import {RibbonButton} from "./ribbon-button"
import {RibbonDrawer} from "./ribbon-drawer"

afterEach(() => {
  document.body.replaceChildren()
})

async function mountDrawer(collapsed = true) {
  const drawer = new RibbonDrawer()
  drawer.label = "Paragraph"
  drawer.icon = "Align"
  drawer.collapsed = collapsed
  for(const label of ["Align", "Lists", "Spacing"]) {
    const button = new RibbonButton()
    button.label = label
    drawer.append(button)
  }
  document.body.append(drawer)
  await drawer.updateComplete
  return drawer
}

describe("responsive ribbon drawer", () => {
  it("uses a representative summary while preserving the original controls in a wider drawer", async () => {
    const drawer = await mountDrawer()
    const summary = drawer.shadowRoot!.querySelector(".summary")!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!

    expect(summary.textContent).toContain("Paragraph")
    expect(summary.querySelector(".icon-tabler-align-left")).not.toBeNull()
    expect(drawer.layoutWidths).toEqual({collapsed: 80, expanded: 208})
    expect(getComputedStyle(drawer).minWidth).toBe("80px")
    expect(getComputedStyle(controls).width).toBe("208px")
    expect(getComputedStyle(controls).boxShadow).not.toBe("none")
    expect(getComputedStyle(controls).borderColor).toBe("#d8dee6")
    expect(drawer.children).toHaveLength(3)

    toggle.click()
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(getComputedStyle(controls).maxHeight).toBe("80px")
    expect(getComputedStyle(controls).paddingTop).toBe("8px")
    expect(getComputedStyle(controls).paddingBottom).toBe("8px")
    expect(getComputedStyle(controls).visibility).toBe("visible")
    expect(getComputedStyle(controls).transition).not.toContain("opacity")
    expect(drawer.children).toHaveLength(3)

    const firstButton = drawer.children[0] as RibbonButton
    await firstButton.updateComplete
    firstButton.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(false)
    expect(drawer.hasAttribute("drawer-visible")).toBe(true)
    expect(getComputedStyle(controls).maxHeight).toBe("0")
    expect(getComputedStyle(controls).visibility).toBe("visible")
  })

  it("hides and disables the expand toggle when no more content exists", async () => {
    const drawer = await mountDrawer(false)
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!

    expect(toggle.hidden).toBe(true)
    expect(toggle.disabled).toBe(true)
    expect(getComputedStyle(drawer).flexGrow).toBe("0")
    expect(drawer.layoutWidths.expanded).toBe(208)
  })

  it("uses the same component for optional vertical expansion", async () => {
    const drawer = await mountDrawer(false)
    const more = new RibbonButton()
    more.label = "More"
    more.slot = "more"
    drawer.expandable = true
    drawer.append(more)
    await drawer.updateComplete
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    const moreSlot = drawer.shadowRoot!.querySelector<HTMLSlotElement>('slot[name="more"]')!

    expect(toggle.hidden).toBe(false)
    expect(toggle.disabled).toBe(false)
    expect(moreSlot.hidden).toBe(true)

    toggle.click()
    await drawer.updateComplete

    expect(section.classList.contains("expanded")).toBe(true)
    expect(moreSlot.hidden).toBe(false)
  })

  it("closes a compact drawer when the drawer expands again", async () => {
    const drawer = await mountDrawer()
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!

    toggle.click()
    await drawer.updateComplete
    drawer.collapsed = false
    await drawer.updateComplete
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(false)
    expect(getComputedStyle(drawer).minWidth).toBe("208px")
  })
})

describe("responsive ribbon layout", () => {
  it("collapses drawers one at a time from right to left", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const content = ribbon.shadowRoot!.querySelector<HTMLElement>(".ribbon-content")!
    const drawers = Array.from(content.querySelectorAll<RibbonDrawer>(
      ":scope > ribbon-drawer",
    ))
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    const updateLayout = (ribbon as unknown as {
      updateResponsiveLayout(drawers: RibbonDrawer[]): void
    }).updateResponsiveLayout.bind(ribbon)

    expect(drawers.map(drawer => drawer.layoutWidths.expanded)).toEqual([208, 266, 208])

    for(const [clientWidth, expected] of [
      [700, [false, false, false]],
      [600, [false, false, true]],
      [530, [false, true, true]],
      [350, [true, true, true]],
    ] as const) {
      Object.defineProperty(content, "clientWidth", {value: clientWidth, configurable: true})
      updateLayout(drawers)
      await Promise.all(drawers.map(drawer => drawer.updateComplete))
      expect(drawers.map(drawer => drawer.collapsed)).toEqual(expected)
    }
  })
})
