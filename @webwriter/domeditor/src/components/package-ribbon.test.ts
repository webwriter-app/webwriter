// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import type {WebWriterPackage} from "../packages"
import {AppRibbon} from "./ribbon"
import {RibbonButton} from "./ribbon-button"
import {RibbonDrawer} from "./ribbon-drawer"

const packageFixture = (name = "demo"): WebWriterPackage => ({
  name: `@webwriter/${name}`,
  version: "1.0.0",
  label: name.replace(/^./, letter => letter.toUpperCase()),
  description: `The ${name} package`,
  iconUrl: "https://example.com/icon.svg",
  authors: ["Ada"],
  license: "MIT",
  keywords: ["webwriter-widget", name],
  links: {},
  scripts: [`https://example.com/${name}.js`],
  styles: [],
  members: [
    {
      id: `@webwriter/${name}@1.0.0:./widgets/webwriter-${name}`,
      packageName: `@webwriter/${name}`,
      packageVersion: "1.0.0",
      exportName: `./widgets/webwriter-${name}.*`,
      kind: "widget",
      label: `${name} Widget`,
      insertable: true,
      tagName: `webwriter-${name}`,
    },
    {
      id: `@webwriter/${name}@1.0.0:./snippets/${name}`,
      packageName: `@webwriter/${name}`,
      packageVersion: "1.0.0",
      exportName: `./snippets/${name}.html`,
      kind: "snippet",
      label: `${name} Snippet`,
      insertable: true,
      htmlUrl: `https://example.com/${name}.html`,
    },
  ],
})

afterEach(() => document.body.replaceChildren())

describe("package ribbon controls", () => {
  it("fills the remaining space after the insertion drawers on Start", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawerLabels = () => Array.from(
      ribbon.shadowRoot!.querySelectorAll<RibbonDrawer>(".ribbon-content > ribbon-drawer"),
      drawer => drawer.label,
    )
    const packageDrawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!

    expect(drawerLabels()).toEqual(["Marks", "Elements", "Packages"])
    expect(getComputedStyle(packageDrawer).flexGrow).toBe("1")
  })

  it("uses horizontal two-cell package buttons, a one-package search field, and member menus", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const demoPackage = packageFixture()
    ribbon.packages = [demoPackage]
    ribbon.installedPackages = [demoPackage]
    document.body.append(ribbon)
    await ribbon.updateComplete
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    const button = drawer.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await Promise.all([search.updateComplete, button.updateComplete])

    expect(search.shadowRoot!.querySelector(".icon-tabler-search")).not.toBeNull()
    expect(getComputedStyle(search).width).toBe("100%")
    expect(button.variant).toBe("package")
    expect(button.muted).toBe(false)
    expect(getComputedStyle(button.shadowRoot!.querySelector(".main-button")!).flexDirection).toBe("row")
    expect(button.shadowRoot!.querySelector('button[aria-label="Show more Demo options"]')).not.toBeNull()

    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    expect(getComputedStyle(controls).gridTemplateColumns).toContain("minmax(4rem, 1fr)")
    expect(getComputedStyle(controls).gap).toBe("0")
    expect(getComputedStyle(controls).paddingBottom).toBe("4px")
    expect(RibbonDrawer.styles.toString()).toContain("grid-column: span 2")
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(2, minmax(0, 1fr))")
    expect(getComputedStyle(search).height).toBe("calc(100% - 4px)")
    expect(getComputedStyle(button.shadowRoot!.querySelector(".button-row")!).height).toBe("100%")
    expect(getComputedStyle(search.shadowRoot!.querySelector(".field")!).backgroundColor).toBe("transparent")
    expect(getComputedStyle(button.shadowRoot!.querySelector(".button-label")!).fontSize).toContain("calc")
    expect(getComputedStyle(button.shadowRoot!.querySelector(".button-label-text")!).whiteSpace).toBe("normal")
    expect(RibbonButton.styles.toString()).toMatch(/\.submenu-trigger\s*\{[\s\S]*?height:\s*100%/)
    expect(RibbonButton.styles.toString()).toMatch(/\.submenu-trigger\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1/)

    button.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Show more Demo options"]')!.click()
    await button.updateComplete
    const menu = button.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    expect(menu.getAttribute("popover")).toBe("manual")
    const menuItem = menu.shadowRoot!.querySelector('button[title="demo Snippet"]')!
    expect(menuItem).not.toBeNull()
    expect(menuItem.querySelector('img[src="https://example.com/icon.svg"]')).not.toBeNull()
    expect(button.shadowRoot!.querySelector(".details")?.getAttribute("popover")).toBe("manual")
  })

  it("does not highlight installed packages outside management hover", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const installed = packageFixture("installed")
    ribbon.packages = [installed]
    ribbon.installedPackages = [installed]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Installed"]')!
    await button.updateComplete
    const row = button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
    const style = getComputedStyle(row)

    expect(button.active).toBe(true)
    expect(style.backgroundColor).toBe("transparent")
    expect(style.borderColor).toBe("transparent")
    expect(style.boxShadow).toBe("none")
  })

  it("only gives installed packages a member chevron", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const installed = packageFixture("installed")
    ribbon.packages = [installed, packageFixture("available")]
    ribbon.installedPackages = [installed]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const installedButton = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Installed"]')!
    const availableButton = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Available"]')!
    await Promise.all([installedButton.updateComplete, availableButton.updateComplete])

    expect(installedButton.shadowRoot!.querySelector(".submenu-chevron")).not.toBeNull()
    expect(availableButton.shadowRoot!.querySelector(".submenu-chevron")).toBeNull()
  })

  it("opens compact package details to the left with friendly keyword metadata", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const pkg = packageFixture("details")
    pkg.authors = ["Ada", "Grace"]
    pkg.keywords = ["webwriter-widget", "widget-practical", "isced2011-1", "iscedf2013-05"]
    ribbon.packages = [pkg]
    ribbon.installedPackages = [pkg]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Packages"] ribbon-button[label="Details"]',
    )!
    await button.updateComplete
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({left: 400, top: 72, right: 528, bottom: 112, width: 128, height: 40}),
      configurable: true,
    })
    button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
      .dispatchEvent(new MouseEvent("mouseenter"))
    await button.updateComplete

    const details = button.shadowRoot!.querySelector<HTMLElement>(".details")!
    expect(details.style.left).toBe("122px")
    expect(details.style.top).toBe("72px")
    expect(details.textContent).toContain("By Ada, Grace")
    expect(details.textContent).toContain("Primary education")
    expect(details.textContent).toContain("Natural sciences, mathematics and statistics")
    expect(details.textContent).not.toContain("License")
    expect(details.textContent).not.toContain("Contents")
    expect(details.textContent).not.toContain("webwriter-widget")
    expect(details.querySelector(".icon-tabler-backpack")).not.toBeNull()
    expect(details.querySelector(".icon-tabler-flask")).not.toBeNull()
    expect(RibbonButton.styles.toString()).not.toContain("background: #f2f2f2")
  })

  it("opens package details to the right when there is no room on the left", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const pkg = packageFixture("right")
    ribbon.packages = [pkg]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Packages"] ribbon-button[label="Right"]',
    )!
    await button.updateComplete
    Object.defineProperty(button, "getBoundingClientRect", {
      value: () => ({left: 8, top: 72, right: 136, bottom: 112, width: 128, height: 40}),
      configurable: true,
    })
    button.shadowRoot!.querySelector<HTMLElement>(".button-row")!
      .dispatchEvent(new MouseEvent("mouseenter"))
    await button.updateComplete

    const details = button.shadowRoot!.querySelector<HTMLElement>(".details")!
    expect(Number.parseFloat(details.style.left)).toBeGreaterThanOrEqual(142)
  })

  it("keeps installed packages first whether the drawer is open or closed", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const available = packageFixture("available")
    const installed = packageFixture("installed")
    ribbon.packages = [available, installed, packageFixture("another")]
    ribbon.installedPackages = [installed]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const labels = () => Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"), button => button.label)
    expect(labels()).toEqual(["Installed", "Available", "Another"])

    drawer.openDrawer(true)
    await drawer.updateComplete
    await ribbon.updateComplete
    expect(labels()).toEqual(["Installed", "Available", "Another"])
  })

  it("raises an open Packages drawer above the toolbox", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.packages = [packageFixture("one"), packageFixture("two"), packageFixture("three")]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    drawer.dispatchEvent(new CustomEvent("ribbon-drawer-state-change", {
      detail: {label: "Packages", open: true}, bubbles: true, composed: true,
    }))
    await ribbon.updateComplete

    expect(ribbon.hasAttribute("package-drawer-open")).toBe(true)
    drawer.dispatchEvent(new CustomEvent("ribbon-drawer-state-change", {
      detail: {label: "Packages", open: false}, bubbles: true, composed: true,
    }))
    await ribbon.updateComplete
    expect(ribbon.hasAttribute("package-drawer-open")).toBe(true)
    drawer.dispatchEvent(new CustomEvent("ribbon-drawer-close-complete", {
      detail: {label: "Packages"}, bubbles: true, composed: true,
    }))
    await ribbon.updateComplete
    expect(ribbon.hasAttribute("package-drawer-open")).toBe(false)
    expect(AppRibbon.styles.toString()).toContain(':host([package-drawer-open])')
  })

  it("accounts for the unused cell beside search in odd-width grids", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.packages = Array.from({length: 9}, (_, index) => packageFixture(`package-${index + 1}`))
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    Object.defineProperty(controls, "getBoundingClientRect", {
      value: () => ({width: 462.4}),
      configurable: true,
    })
    ;(ribbon as unknown as {updatePackageCapacity(): void}).updatePackageCapacity()
    await ribbon.updateComplete

    expect(drawer.querySelectorAll('ribbon-button:not([slot="more"])')).toHaveLength(5)
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(4)
  })

  it("uses the full drawer width when only one package-button column fits", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.packages = [
      packageFixture("long-package-name"),
      packageFixture("second-package"),
      packageFixture("third-package"),
    ]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    Object.defineProperty(controls, "getBoundingClientRect", {
      value: () => ({width: 240}),
      configurable: true,
    })
    ;(ribbon as unknown as {updatePackageCapacity(): void}).updatePackageCapacity()
    await ribbon.updateComplete
    await drawer.updateComplete

    expect(drawer.singleColumn).toBe(true)
    expect(drawer.querySelectorAll('ribbon-button:not([slot="more"])')).toHaveLength(2)
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(1)
    expect(drawer.hasAttribute("single-column")).toBe(true)
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))")
    expect(RibbonDrawer.styles.toString()).toContain(
      'grid-template-columns: var(--package-grid-template-columns, minmax(0, 1fr))',
    )
    expect(RibbonDrawer.styles.toString()).toContain('[single-column]) ::slotted(ribbon-button[variant="package"])')
    expect(RibbonDrawer.styles.toString()).toContain('[single-column]) ::slotted(package-search)')
  })

  it("opens management mode on search focus and only shows remove icons for installed packages", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const alphaPackage = packageFixture("alpha")
    ribbon.packages = [alphaPackage, packageFixture("beta"), packageFixture("gamma")]
    ribbon.installedPackages = [alphaPackage]
    ;(ribbon as unknown as {packageVisibleCount: number}).packageVisibleCount = 1
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    await search.updateComplete
    const input = search.shadowRoot!.querySelector<HTMLInputElement>("input")!
    input.focus()
    await drawer.updateComplete
    await ribbon.updateComplete

    let alpha = drawer.querySelector<RibbonButton>('ribbon-button[label="Alpha"]')!
    const beta = drawer.querySelector<RibbonButton>('ribbon-button[label="Beta"]')!
    await alpha.updateComplete
    await beta.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(alpha.action).toBe("package:@webwriter/alpha")
    expect(alpha.cornerAction).toBe("package-toggle:@webwriter/alpha")
    expect(alpha.keepDrawerOpen).toBe(true)
    expect(alpha.shadowRoot!.querySelector(".corner-icon .icon-tabler-x")).not.toBeNull()
    expect(alpha.shadowRoot!.querySelector(".submenu-chevron")).toBeNull()
    expect(beta.shadowRoot!.querySelector(".corner-icon")).toBeNull()
    expect(beta.muted).toBe(true)

    input.value = "alpha"
    input.dispatchEvent(new InputEvent("input", {bubbles: true, composed: true}))
    await ribbon.updateComplete
    alpha = drawer.querySelector<RibbonButton>('ribbon-button[label="Alpha"]')!
    await alpha.updateComplete

    expect(search.shadowRoot!.querySelector('button[aria-label="Clear package search"]')).not.toBeNull()
    expect(alpha.shadowRoot!.querySelector(".corner-icon .icon-tabler-x")).not.toBeNull()

    search.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Clear package search"]')!.click()
    await search.updateComplete
    await ribbon.updateComplete
    expect(search.shadowRoot!.querySelector<HTMLInputElement>("input")!.value).toBe("")
    expect(drawer.hasAttribute("drawer-open")).toBe(true)
  })

  it("inserts from the package body and removes only from its corner control", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const alphaPackage = packageFixture("alpha")
    ribbon.packages = [alphaPackage, packageFixture("beta"), packageFixture("gamma")]
    ribbon.installedPackages = [alphaPackage]
    ;(ribbon as unknown as {packageVisibleCount: number}).packageVisibleCount = 1
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!.click()
    await drawer.updateComplete
    await ribbon.updateComplete
    const action = vi.fn()
    ribbon.addEventListener("ribbon-button-click", action)
    const button = drawer.querySelector<RibbonButton>('ribbon-button[label="Alpha"]')!
    await button.updateComplete
    button.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    await drawer.updateComplete

    expect(action).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "package:@webwriter/alpha", keepDrawerOpen: true},
    }))
    expect(drawer.hasAttribute("drawer-open")).toBe(true)

    button.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove Alpha"]')!.click()
    expect(action).toHaveBeenLastCalledWith(expect.objectContaining({
      detail: {label: "package-toggle:@webwriter/alpha", keepDrawerOpen: true},
    }))
    expect(RibbonButton.styles.toString()).toMatch(
      /:host\(\[variant="package"\]\) \.corner-trigger\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1;/,
    )
  })
})
