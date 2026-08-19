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
    expect(drawer.layoutWidths).toEqual({collapsed: 84, expanded: 212})
    expect(getComputedStyle(drawer).minWidth).toBe("84px")
    expect(getComputedStyle(controls).width).toBe("212px")
    expect(getComputedStyle(controls).boxShadow).not.toBe("none")
    expect(getComputedStyle(controls).borderColor).toBe("#d8dee6")
    expect(getComputedStyle(controls).gap).toBe("0")
    expect(getComputedStyle(controls).visibility).toBe("hidden")
    expect(getComputedStyle(controls).transition).toBe("none")
    expect(drawer.children).toHaveLength(3)

    toggle.click()
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(toggle.getAttribute("aria-expanded")).toBe("true")
    expect(getComputedStyle(controls).maxHeight).toBe("90px")
    expect(getComputedStyle(controls).paddingTop).toBe("8px")
    expect(getComputedStyle(controls).paddingBottom).toBe("8px")
    expect(getComputedStyle(controls).visibility).toBe("visible")
    expect(getComputedStyle(controls).transition).toContain("max-height")
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
    expect(drawer.layoutWidths.expanded).toBe(212)
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

    expect(getComputedStyle(section).paddingBottom).toBe("0px")
    expect(getComputedStyle(drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!).paddingBottom).toBe("4px")
    expect(getComputedStyle(toggle).bottom).toBe("-4px")

    expect(toggle.hidden).toBe(false)
    expect(toggle.disabled).toBe(false)
    expect(moreSlot.hidden).toBe(true)

    toggle.click()
    await drawer.updateComplete

    expect(section.classList.contains("expanded")).toBe(true)
    expect(moreSlot.hidden).toBe(false)
    expect(getComputedStyle(toggle).bottom).toBe("-10px")
  })

  it("caps an expanded package drawer at the viewport bottom", async () => {
    const drawer = new RibbonDrawer()
    drawer.layout = "packages"
    drawer.expandable = true
    document.body.append(drawer)
    await drawer.updateComplete
    Object.defineProperty(drawer, "getBoundingClientRect", {
      value: () => ({top: 120, height: 90}),
      configurable: true,
    })

    drawer.openDrawer()
    await drawer.updateComplete

    expect(drawer.style.getPropertyValue("--ribbon-drawer-available-height"))
      .toBe(`${window.innerHeight - 120 - 8}px`)
    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    expect(section.style.getPropertyValue("--package-expanded-height")).toMatch(/px$/)
    expect(RibbonDrawer.styles.toString()).toContain("height: var(--package-expanded-height")
    expect(RibbonDrawer.styles.toString()).toContain("padding-bottom: var(--package-expanded-grid-padding")
    expect(getComputedStyle(section).transition).toContain("max-height")
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    expect(getComputedStyle(controls).overflowY).toBe("hidden")

    const opened = new Event("transitionend") as TransitionEvent
    Object.defineProperty(opened, "propertyName", {value: "max-height"})
    section.dispatchEvent(opened)
    await drawer.updateComplete
    expect(getComputedStyle(controls).overflowY).toBe("auto")

    const expandedRows = getComputedStyle(controls).gridAutoRows
    drawer.closeDrawer()
    await drawer.updateComplete
    expect(section.classList.contains("closing")).toBe(true)
    expect(getComputedStyle(controls).gridAutoRows).toBe(expandedRows)
    expect(getComputedStyle(controls).overflowY).toBe("hidden")
  })

  it("fits an open package drawer to reflowed content up to the viewport", async () => {
    const drawer = new RibbonDrawer()
    drawer.layout = "packages"
    drawer.expandable = true
    drawer.append(document.createElement("package-search"))
    for(let index = 0; index < 12; index++) {
      const button = new RibbonButton()
      button.variant = "package"
      button.label = `Package ${index}`
      drawer.append(button)
    }
    document.body.append(drawer)
    await drawer.updateComplete

    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    let drawerHeight = 90
    let controlsWidth = 400
    Object.defineProperty(drawer, "getBoundingClientRect", {
      value: () => ({top: 120, height: 90}), configurable: true,
    })
    Object.defineProperty(section, "getBoundingClientRect", {
      value: () => ({height: drawerHeight}), configurable: true,
    })
    Object.defineProperty(controls, "getBoundingClientRect", {
      value: () => ({height: drawerHeight - 2, width: controlsWidth}), configurable: true,
    })

    drawer.openDrawer()
    await drawer.updateComplete
    const initialHeight = Number.parseFloat(section.style.getPropertyValue("--package-expanded-height"))
    drawerHeight = initialHeight
    const resize = (drawer as unknown as {updatePackageDrawerSize(): boolean})
      .updatePackageDrawerSize.bind(drawer)

    controlsWidth = 200
    resize()
    const narrowedHeight = Number.parseFloat(section.style.getPropertyValue("--package-expanded-height"))
    expect(narrowedHeight).toBeGreaterThan(initialHeight)
    expect(narrowedHeight).toBeLessThanOrEqual(window.innerHeight - 120)

    drawerHeight = narrowedHeight
    controlsWidth = 600
    resize()
    expect(Number.parseFloat(section.style.getPropertyValue("--package-expanded-height"))).toBeLessThan(narrowedHeight)
  })

  it("keeps expanded package contents anchored to the top edge", async () => {
    const drawer = new RibbonDrawer()
    drawer.layout = "packages"
    const search = document.createElement("package-search")
    const button = new RibbonButton()
    button.variant = "package"
    drawer.append(search, button)
    document.body.append(drawer)
    await drawer.updateComplete

    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    Object.defineProperty(controls, "getBoundingClientRect", {
      value: () => ({top: 100, height: 80, width: 240}), configurable: true,
    })
    Object.defineProperty(section, "getBoundingClientRect", {
      value: () => ({top: 100, height: 80}), configurable: true,
    })
    ;(drawer as unknown as {captureExpandedContentOffset(): void}).captureExpandedContentOffset()

    expect(controls.style.getPropertyValue("--package-expanded-grid-offset")).toBe("0px")
    expect(controls.style.getPropertyValue("--package-expanded-grid-padding")).toBe("4px")
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
    expect(getComputedStyle(drawer).minWidth).toBe("212px")
  })

  it("hides a closed drawer without animating when responsive layout collapses it", async () => {
    const drawer = await mountDrawer(false)
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!

    drawer.collapsed = true
    await drawer.updateComplete

    expect(drawer.hasAttribute("drawer-visible")).toBe(false)
    expect(getComputedStyle(controls).maxHeight).toBe("0")
    expect(getComputedStyle(controls).visibility).toBe("hidden")
    expect(getComputedStyle(controls).transition).toBe("none")
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

    expect(drawers.map(drawer => drawer.layoutWidths.expanded)).toEqual([334.8, 324, 212, 264])

    for(const [clientWidth, expected] of [
      [1200, [false, false, false, false]],
      [1000, [false, false, false, true]],
      [850, [false, false, true, true]],
      [650, [false, true, true, true]],
      [350, [true, true, true, true]],
    ] as const) {
      Object.defineProperty(content, "clientWidth", {value: clientWidth, configurable: true})
      updateLayout(drawers)
      await Promise.all(drawers.map(drawer => drawer.updateComplete))
      expect(drawers.map(drawer => drawer.collapsed)).toEqual(expected)
    }
  })
})
