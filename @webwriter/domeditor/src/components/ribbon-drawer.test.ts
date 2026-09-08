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
  it("widens three-column Style drawers in both states", () => {
    const styles = RibbonDrawer.styles.toString()

    expect(styles).toMatch(/:host\(\[layout="element-style"\]\)\s*\{[\s\S]*?--ribbon-drawer-expanded-width:\s*22\.5rem;/)
    expect(styles).toMatch(/:host\(\[layout="element-style"\]\)\s*\{[\s\S]*?--ribbon-drawer-width:\s*min\(33rem, calc\(100vw - 1rem\)\);/)
    expect(styles).toMatch(/:host\(\[layout="element-style"\]\) \.drawer\.expanded \.controls\s*\{[\s\S]*?padding-bottom:\s*0;/)
    expect(styles).toMatch(/:host\(\[layout="element-style"\]\) \.drawer\.expanded\s*\{[\s\S]*?padding-right:\s*0;/)
    expect(styles).toMatch(/\.drawer\.expanded ::slotted\(element-style-editor\[mode="basic"\]\)\s*\{[\s\S]*?margin-right:\s*0\.5rem;/)
  })

  it("keeps the document Metadata drawer compact", () => {
    const styles = RibbonDrawer.styles.toString()

    expect(styles).toMatch(/:host\(\[layout="document-head"\]\)\s*\{[\s\S]*?--ribbon-drawer-expanded-width:\s*25rem;/)
    expect(styles).toMatch(/:host\(\[layout="document-head"\]\)\s*\{[\s\S]*?--ribbon-drawer-width:\s*min\(25rem, calc\(100vw - 1rem\)\);/)
  })

  it("uses the full inline width for full-height History version cards", async () => {
    const drawer = new RibbonDrawer()
    drawer.layout = "history-versions"
    document.body.append(drawer)
    await drawer.updateComplete

    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    expect(getComputedStyle(drawer).flexGrow).toBe("1")
    expect(getComputedStyle(section).paddingLeft).toBe("0px")
    expect(getComputedStyle(section).paddingRight).toBe("0px")
    expect(getComputedStyle(controls).alignItems).toBe("stretch")
    expect(getComputedStyle(controls).paddingBottom).toBe("0px")
  })

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

  it("overlaps the adjacent separator while keeping the package grid in place", async () => {
    const drawer = new RibbonDrawer()
    drawer.layout = "packages"
    drawer.expandable = true
    document.body.append(drawer)
    await drawer.updateComplete
    const section = drawer.shadowRoot!.querySelector<HTMLElement>(".drawer")!
    const closedPadding = Number.parseFloat(getComputedStyle(section).paddingLeft)

    drawer.openDrawer()
    await drawer.updateComplete
    const opened = getComputedStyle(section)
    expect(opened.marginLeft).toBe("-1px")
    expect(opened.paddingLeft).toBe(`calc(${closedPadding}px + 1px)`)
    expect(opened.borderLeft).toBe(opened.borderRight)

    drawer.closeDrawer()
    await drawer.updateComplete
    expect(getComputedStyle(section).marginLeft).toBe("-1px")
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
    expect(RibbonDrawer.styles.toString()).toContain("scrollbar-width: none;")
    expect(RibbonDrawer.styles.toString()).toMatch(
      /\.controls::-webkit-scrollbar\s*\{[\s\S]*?display:\s*none;/,
    )

    const nestedTransition = new Event("transitionend", {bubbles: true}) as TransitionEvent
    Object.defineProperty(nestedTransition, "propertyName", {value: "max-height"})
    controls.dispatchEvent(nestedTransition)
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-settled")).toBe(false)
    expect(getComputedStyle(controls).overflowY).toBe("hidden")

    const opened = new Event("transitionend") as TransitionEvent
    Object.defineProperty(opened, "propertyName", {value: "max-height"})
    section.dispatchEvent(opened)
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-scrollable")).toBe(false)
    expect(getComputedStyle(controls).overflowY).toBe("hidden")

    const rounding = new Event("transitionend") as TransitionEvent
    Object.defineProperty(rounding, "propertyName", {value: "max-height"})
    Object.defineProperty(controls, "scrollHeight", {value: 101, configurable: true})
    Object.defineProperty(controls, "clientHeight", {value: 100, configurable: true})
    section.dispatchEvent(rounding)
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-scrollable")).toBe(false)

    const overflowing = new Event("transitionend") as TransitionEvent
    Object.defineProperty(overflowing, "propertyName", {value: "max-height"})
    Object.defineProperty(controls, "scrollHeight", {value: 200, configurable: true})
    Object.defineProperty(controls, "clientHeight", {value: 100, configurable: true})
    section.dispatchEvent(overflowing)
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-scrollable")).toBe(true)
    expect(getComputedStyle(controls).overflowY).toBe("auto")
    expect(RibbonDrawer.styles.toString()).toContain("scrollbar-width: none;")

    const expandedRows = getComputedStyle(controls).gridAutoRows
    controls.scrollTop = 100
    drawer.closeDrawer()
    await drawer.updateComplete
    expect(section.classList.contains("closing")).toBe(true)
    expect(controls.scrollTop).toBe(0)
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
    expect(RibbonDrawer.styles.toString()).toContain("grid-auto-rows: var(--package-row-height, 2.45rem)")
  })

  it("preserves the three-row sizing when reopening during the closing transition", async () => {
    const drawer = new RibbonDrawer()
    drawer.layout = "packages"
    drawer.expandable = true
    document.body.append(drawer)
    await drawer.updateComplete
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    let height = 88
    Object.defineProperty(controls, "getBoundingClientRect", {
      value: () => ({height, width: 240}), configurable: true,
    })

    drawer.openDrawer()
    await drawer.updateComplete
    expect(controls.style.getPropertyValue("--package-row-height")).toBe("28px")
    height = 280
    drawer.closeDrawer()
    await drawer.updateComplete
    drawer.openDrawer()
    await drawer.updateComplete

    expect(controls.style.getPropertyValue("--package-row-height")).toBe("28px")
    expect(controls.style.width).toBe("")
    drawer.closeDrawer()
    const closed = new Event("transitionend")
    Object.defineProperty(closed, "propertyName", {value: "max-height"})
    drawer.shadowRoot!.querySelector(".drawer")!.dispatchEvent(closed)
    await drawer.updateComplete
    expect(controls.style.getPropertyValue("--package-row-height")).toBe("")
  })

  it("lets a compact package pullout reflow with its available width", async () => {
    const drawer = new RibbonDrawer()
    drawer.layout = "packages"
    drawer.collapsed = true
    document.body.append(drawer)
    await drawer.updateComplete

    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    Object.defineProperty(controls, "getBoundingClientRect", {
      value: () => ({width: 240, height: 2}), configurable: true,
    })

    ;(drawer as unknown as {captureExpandedContentOffset(): void}).captureExpandedContentOffset()

    expect(controls.style.width).toBe("")
    expect(controls.style.gridTemplateColumns).toBe("")
    expect(drawer.packageColumnCount).toBe(1)
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
  it("uses the compact Elements layout before collapsing drawers", async () => {
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

    expect(drawers.map(drawer => drawer.layoutWidths.expanded)).toEqual([295.6, 356, 192])

    expect(drawers.map(drawer => drawer.layoutWidths.compact)).toEqual([undefined, 128, undefined])
    expect(drawers.map(drawer => drawer.layoutWidths.minimum)).toEqual([undefined, undefined, 128])

    for(const [clientWidth, expectedCollapsed, expectedCompact] of [
      [1200, [false, false, false], [false, false, false]],
      [1000, [false, false, false], [false, false, false]],
      [920, [false, false, false], [false, false, false]],
      [850, [false, false, false], [false, true, false]],
      [780, [false, false, false], [false, true, false]],
      [650, [false, false, false], [false, true, false]],
      [600, [false, false, false], [false, true, false]],
      [550, [false, false, true], [false, true, false]],
      [500, [false, true, true], [false, false, false]],
    ] as const) {
      Object.defineProperty(content, "clientWidth", {value: clientWidth, configurable: true})
      updateLayout(drawers)
      await Promise.all(drawers.map(drawer => drawer.updateComplete))
      expect(drawers.map(drawer => drawer.collapsed)).toEqual(expectedCollapsed)
      expect(drawers.map(drawer => drawer.compact)).toEqual(expectedCompact)
    }
  })
})
