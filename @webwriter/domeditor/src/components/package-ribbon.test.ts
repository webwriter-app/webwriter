// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {html} from "lit"
import type {WebWriterPackage} from "../packages"
import {AppRibbon} from "./ribbon"
import {RibbonButton} from "./ribbon-button"
import {RibbonMenu} from "./ribbon-menu"
import {RibbonDrawer} from "./ribbon-drawer"
import {ribbonElementInsertionAction, ribbonInsertionAction, ribbonInsertionDragType} from "./insertion-menu"

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

function dragData(target: HTMLElement) {
  const values = new Map<string, string>()
  const dataTransfer = {
    effectAllowed: "none",
    setData: vi.fn((type: string, value: string) => values.set(type, value)),
    getData: (type: string) => values.get(type) ?? "",
    setDragImage: vi.fn(),
  }
  const event = new Event("dragstart", {bubbles: true, cancelable: true, composed: true})
  Object.assign(event, {dataTransfer})
  target.dispatchEvent(event)
  return dataTransfer
}

describe("package ribbon controls", () => {
  it("keeps wrapped package labels compact within their rows", async () => {
    for(const label of ["Map", "PhET Simulation", "Interactive Video", "Neural Network", "Branching Scenario"]) {
      const button = new RibbonButton()
      button.variant = "package"
      button.label = label
      document.body.append(button)
      await button.updateComplete

      const text = button.shadowRoot!.querySelector(".button-label-text")!
      const labelStyle = getComputedStyle(button.shadowRoot!.querySelector(".button-label")!)
      expect(text.textContent).toBe(label)
      expect(getComputedStyle(text).whiteSpace).toBe("normal")
      expect(labelStyle.lineHeight).toBe("1.1")
      expect(labelStyle.getPropertyValue("-webkit-line-clamp")).toBe("2")
    }
  })

  it("drags package, member, and saved snippet actions from expanded and collapsed ribbon items", async () => {
    expect(ribbonInsertionAction("package:@webwriter/demo")).toBe(true)
    expect(ribbonInsertionAction("package-member:@webwriter/demo:./widgets/demo")).toBe(true)
    expect(ribbonInsertionAction("user-snippet:snippet-1")).toBe(true)
    expect(ribbonInsertionAction("package:")).toBe(false)
    expect(ribbonInsertionAction("user-snippet:")).toBe(false)
    expect(ribbonInsertionAction("pin-snippet")).toBe(false)
    for(const action of ["list-style:ul:disc", "list-style:ol:decimal-leading-zero", "insert-graphic-shape:rectangle", "insert-math:frac"]) {
      expect(ribbonElementInsertionAction(action)).toBe(true)
    }
    for(const action of ["list-style:ul:decimal", "list-style:ol:disc", "insert-graphic-shape:unknown", "insert-math:unknown"]) {
      expect(ribbonElementInsertionAction(action)).toBe(false)
    }

    const expanded = new RibbonButton()
    expanded.variant = "package"
    expanded.label = "Demo"
    expanded.action = "package:@webwriter/demo"
    expanded.icon = "Package"
    expanded.dragHTML = "<webwriter-demo></webwriter-demo>"
    document.body.append(expanded)
    await expanded.updateComplete
    const main = expanded.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    expect(main.getAttribute("draggable")).toBe("true")
    const down = new MouseEvent("mousedown", {bubbles: true, cancelable: true, composed: true})
    main.dispatchEvent(down)
    expect(down.defaultPrevented).toBe(false)
    const packageData = dragData(main)
    expect(packageData.getData("text/html")).toBe("<webwriter-demo></webwriter-demo>")
    expect(packageData.getData(ribbonInsertionDragType)).toBe("package:@webwriter/demo")
    expect(packageData.effectAllowed).toBe("copy")
    expect(packageData.setDragImage).toHaveBeenCalledWith(main.querySelector(".button-icon"), 12, 12)

    const collapsed = new RibbonMenu()
    collapsed.groups = [{label: "Packages", buttons: [
      {label: "Demo", action: "package:@webwriter/demo", icon: "Package"},
      {label: "Demo Widget", action: "package-member:@webwriter/demo:./widgets/demo", icon: "Puzzle"},
      {label: "Saved snippet", action: "user-snippet:snippet-1", icon: "FileHorizontal"},
      {label: "Disc list", action: "list-style:ul:disc", icon: "ListDisc"},
      {label: "Rectangle", action: "insert-graphic-shape:rectangle", icon: "Rectangle"},
      {label: "Fraction", action: "insert-math:frac", icon: "Formula"},
      {label: "Invalid math", action: "insert-math:unknown", icon: "Formula"},
      {label: "Snippets", menuOnly: true, icon: "FileHorizontal", submenu: [
        {label: "Saved snippet", action: "user-snippet:snippet-1", icon: "FileHorizontal"},
      ]},
      {label: "Add snippet", iconAction: "pin-snippet", iconActionLabel: "Add snippet", icon: "FileHorizontal"},
    ]}]
    document.body.append(collapsed)
    await collapsed.updateComplete
    const getItem = (label: string) => collapsed.shadowRoot!.querySelector<HTMLButtonElement>(`.item[title="${label}"]`)!
    for(const [label, action] of [
      ["Demo", "package:@webwriter/demo"],
      ["Demo Widget", "package-member:@webwriter/demo:./widgets/demo"],
      ["Saved snippet", "user-snippet:snippet-1"],
      ["Disc list", "list-style:ul:disc"],
      ["Rectangle", "insert-graphic-shape:rectangle"],
      ["Fraction", "insert-math:frac"],
    ]) {
      const item = getItem(label)
      expect(item.getAttribute("draggable")).toBe("true")
      expect(dragData(item).getData(ribbonInsertionDragType)).toBe(action)
    }
    expect(getItem("Invalid math").getAttribute("draggable")).toBe("false")
    expect(getItem("Snippets").getAttribute("draggable")).toBe("false")
    expect(collapsed.shadowRoot!.querySelector<HTMLButtonElement>('.icon-action-trigger[aria-label="Add snippet"]')!.hasAttribute("draggable")).toBe(false)
    getItem("Snippets").click()
    await collapsed.updateComplete
    const nestedSnippet = collapsed.shadowRoot!.querySelector<HTMLButtonElement>('.submenu .item[title="Saved snippet"]')!
    expect(nestedSnippet.getAttribute("draggable")).toBe("true")
    expect(dragData(nestedSnippet).getData(ribbonInsertionDragType)).toBe("user-snippet:snippet-1")
  })

  it("prepares HTML only for installed widget drags and saved snippets", async () => {
    const ribbon = new AppRibbon(), pkg = packageFixture()
    ribbon.packages = [pkg]
    ribbon.settings.userSnippets = [{id: "saved", label: "Saved", html: "<p><b>Saved</b></p>"}]
    document.body.append(ribbon)
    await ribbon.updateComplete
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    await button.updateComplete
    expect(button.dragHTML).toBeUndefined()
    ribbon.installedPackages = [pkg]
    await ribbon.updateComplete
    await button.updateComplete
    expect(button.dragHTML).toBe("<webwriter-demo></webwriter-demo>")
    expect(button.submenu[0]).toMatchObject({action: "package-member:" + pkg.members[1].id})
    expect(typeof button.submenu[0] === "string" ? undefined : button.submenu[0].dragHTML).toBeUndefined()
    const snippets = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Snippets"]')!
    await snippets.updateComplete
    expect(snippets.submenu[0]).toMatchObject({dragHTML: "<p><b>Saved</b></p>"})
    ribbon.expanded = false
    ribbon.menuOpen = true
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
    await menu.updateComplete
    const packages = menu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    await packages.updateComplete
    expect(dragData(packages.shadowRoot!.querySelector<HTMLButtonElement>('[title="Demo"]')!).getData("text/html"))
      .toBe("<webwriter-demo></webwriter-demo>")
  })

  it.each([true, false])("keeps the Snippets dropdown open through removal and the empty hint (expanded: %s)", async expanded => {
    const ribbon = new AppRibbon()
    ribbon.expanded = expanded
    ribbon.menuOpen = !expanded
    ribbon.settings.userSnippets = [
      {id: "new", label: "Newest", html: "<p>new</p>"},
      {id: "old", label: "Oldest", html: "<p>old</p>"},
    ]
    document.body.append(ribbon)
    await ribbon.updateComplete
    let snippets: RibbonButton | RibbonMenu
    if(expanded) {
      snippets = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Snippets"]')!
      await snippets.updateComplete
      snippets.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    }
    else {
      const root = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
      await root.updateComplete
      root.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
      await root.updateComplete
      snippets = root.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
      await snippets.updateComplete
      snippets.shadowRoot!.querySelector<HTMLButtonElement>('[title="Snippets"]')!.click()
    }
    ribbon.addEventListener("ribbon-button-click", event => {
      const action = (event as CustomEvent<{label: string}>).detail.label
      if(!action.startsWith("remove-user-snippet:")) return
      ribbon.settings = {...ribbon.settings, userSnippets: ribbon.settings.userSnippets.filter(item => `remove-user-snippet:${item.id}` !== action)}
    })
    for(const label of ["Newest", "Oldest"]) {
      await snippets.updateComplete
      const menu = snippets.shadowRoot!.querySelector<RibbonMenu>(expanded ? "ribbon-menu" : ".submenu ribbon-menu")!
      await menu.updateComplete
      menu.shadowRoot!.querySelector<HTMLButtonElement>(`[aria-label="Remove ${label}"]`)!.click()
      await ribbon.updateComplete
      await snippets.updateComplete
      const trigger = snippets.shadowRoot!.querySelector<HTMLButtonElement>(expanded ? ".main-button" : '[title="Snippets"]')!
      expect(trigger.getAttribute("aria-expanded")).toBe("true")
      if(!expanded) expect(ribbon.menuOpen).toBe(true)
    }
    expect(ribbon.settings.userSnippets).toEqual([])
    const emptyHint = expanded ? snippets.shadowRoot!.querySelector("ribbon-menu")! : snippets.shadowRoot!.querySelector(".submenu")!
    expect(emptyHint.textContent).toContain("Select something and click to store it here as a snippet")
  })

  it("keeps Snippets first, saves from its icon, and lists newest snippets with removal actions", async () => {
    const ribbon = new AppRibbon()
    ribbon.settings.userSnippets = [
      {id: "new", label: "Newest", html: "<p>new</p>"},
      {id: "old", label: "Oldest", html: "<p>old</p>"},
    ]
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const search = drawer.querySelector("package-search")!
    const snippets = drawer.querySelector<RibbonButton>('ribbon-button[label="Snippets"]')!
    expect(search).not.toBeNull()
    expect(drawer.children[0]).toBe(search)
    expect([...drawer.querySelectorAll("ribbon-button")][0]).toBe(snippets)
    expect(snippets.variant).toBe("package")
    expect(snippets.icon).toBe("FileHorizontal")
    expect(snippets.hoverIcon).toBe("Plus")
    expect(snippets.iconAction).toBe("pin-snippet")
    expect(snippets.iconActionLabel).toBe("Add snippet")
    expect(snippets.dropdownOnClick).toBe(true)
    expect(snippets.submenu.map(item => typeof item === "string" ? item : item.label)).toEqual(["Newest", "Oldest"])
    expect(snippets.submenu.map(item => typeof item === "string" ? "" : item.action)).toEqual([
      "user-snippet:new", "user-snippet:old",
    ])
    expect(snippets.submenu.map(item => typeof item === "string" ? "" : item.removeAction)).toEqual([
      "remove-user-snippet:new", "remove-user-snippet:old",
    ])
    await snippets.updateComplete
    const main = snippets.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    const chevron = snippets.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!
    const iconAction = snippets.shadowRoot!.querySelector<HTMLButtonElement>('.icon-action-trigger[aria-label="Add snippet"]')!
    expect(iconAction.querySelector(".button-icon-default svg")).not.toBeNull()
    expect(iconAction.querySelector(".button-icon-hover svg")).not.toBeNull()
    expect(RibbonButton.styles.toString()).toContain(".button-row.has-icon-action:has(.main-button:hover, .submenu-trigger:hover")
    expect(RibbonButton.styles.toString()).toContain(".button-row.has-icon-action:has(.main-button:active, .submenu-trigger:active) .main-button")
    expect(RibbonButton.styles.toString()).not.toMatch(/\.button-row\.has-icon-action:has\(\.main-button:active, \.submenu-trigger:active\)\s*\{[^}]*background:/)
    expect(RibbonButton.styles.toString()).toContain(':host([variant="package"][active]) .button-row:not(.has-icon-action):hover')
    expect(RibbonMenu.styles.toString()).toContain(".item-row.has-icon-action:has(> .item:hover, > .submenu-toggle:hover")
    expect(RibbonMenu.styles.toString()).toContain(".item-row.has-icon-action:has(> .item:active, > .submenu-toggle:active) > .item")
    expect(RibbonMenu.styles.toString()).not.toContain(".item-row.has-icon-action:has(> .item:active, > .submenu-toggle:active) {")
    const actions = vi.fn()
    ribbon.addEventListener("ribbon-button-click", actions)
    const hoverEvents = vi.fn()
    ribbon.addEventListener("snippet-hover-change", hoverEvents)
    iconAction.dispatchEvent(new MouseEvent("mouseenter", {bubbles: false}))
    expect(hoverEvents.mock.calls[0][0].detail).toEqual({hovered: true})
    iconAction.dispatchEvent(new MouseEvent("mouseleave", {bubbles: false}))
    expect(hoverEvents.mock.calls.at(-1)?.[0].detail).toEqual({hovered: false})
    iconAction.click()
    expect(actions.mock.calls[0][0].detail.label).toBe("pin-snippet")
    await snippets.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("true")
    iconAction.click()
    await snippets.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("true")
    expect(actions.mock.calls.filter(([event]) => event.detail.label === "pin-snippet")).toHaveLength(2)
    main.click()
    await snippets.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("false")
    chevron.click()
    await snippets.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("true")
    expect(snippets.shadowRoot!.querySelector("ribbon-menu")?.hasAttribute("hidden")).toBe(false)
    chevron.click()
    await snippets.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("false")
    main.click()
    await snippets.updateComplete
    const nested = snippets.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await nested.updateComplete
    const remove = nested.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Remove Newest"]')!
    remove.click()
    expect(actions.mock.calls.at(-1)?.[0].detail.label).toBe("remove-user-snippet:new")
  })

  it("keeps Snippets available when empty and shows the empty-state hint in its chevron dropdown", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const snippets = drawer.querySelector<RibbonButton>('ribbon-button[label="Snippets"]')!
    expect(snippets).not.toBeNull()
    expect(snippets.iconAction).toBe("pin-snippet")
    expect(snippets.dropdownCompact).toBe(true)
    expect(snippets.submenu).toHaveLength(0)
    await snippets.updateComplete
    snippets.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await snippets.updateComplete
    expect(snippets.shadowRoot!.querySelector("ribbon-menu")?.textContent).toContain(
      "Select something and click to store it here as a snippet to use later",
    )

  })

  it("opens the expanded snippets dropdown after adding and keeps it open through an empty-to-populated update", async () => {
    const snippets = new RibbonButton()
    snippets.variant = "package"
    snippets.label = "Snippets"
    snippets.action = "snippets"
    snippets.icon = "FileHorizontal"
    snippets.iconAction = "pin-snippet"
    snippets.iconActionLabel = "Add snippet"
    snippets.hoverIcon = "Plus"
    snippets.dropdownOnClick = true
    snippets.dropdownCompact = true
    snippets.dropdown = html`<div class="snippet-empty-hint">Select something and click to store it here as a snippet to use later</div>`
    snippets.submenu = []
    document.body.append(snippets)
    await snippets.updateComplete

    snippets.addEventListener("ribbon-button-click", event => {
      if((event as CustomEvent).detail.label === "pin-snippet") {
        snippets.dropdown = null
        snippets.submenu = [{label: "New snippet", action: "user-snippet:new"}]
        snippets.requestUpdate()
      }
    })
    const iconAction = snippets.shadowRoot!.querySelector<HTMLButtonElement>('.icon-action-trigger[aria-label="Add snippet"]')!
    const actions = vi.fn()
    snippets.addEventListener("ribbon-button-click", actions)
    iconAction.click()
    await snippets.updateComplete
    let main = snippets.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    let menu = snippets.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("true")
    expect(menu.shadowRoot!.querySelector('.item[title="New snippet"]')).not.toBeNull()
    iconAction.click()
    await snippets.updateComplete
    main = snippets.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    expect(main.getAttribute("aria-expanded")).toBe("true")
    expect(actions.mock.calls.filter(([event]) => event.detail.label === "pin-snippet")).toHaveLength(2)
    main.click()
    await snippets.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("false")
    snippets.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await snippets.updateComplete
    expect(snippets.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.getAttribute("aria-expanded")).toBe("true")
  })

  it("opens the collapsed snippets submenu from the add icon and preserves it on repeated adds", async () => {
    const menu = new RibbonMenu()
    const snippetEntry = (submenu: Array<{label: string, action: string}> = []) => ({
      label: "Snippets",
      menuOnly: true,
      iconAction: "pin-snippet",
      iconActionLabel: "Add snippet",
      icon: "FileHorizontal",
      hoverIcon: "Plus",
      submenu,
      ...(submenu.length ? {} : {submenuHeader: html`<div class="snippet-empty-hint">Select something and click to store it here as a snippet to use later</div>`}),
    })
    menu.groups = [{label: "Packages", buttons: [snippetEntry()]}]
    document.body.append(menu)
    await menu.updateComplete
    menu.addEventListener("ribbon-button-click", event => {
      if((event as CustomEvent).detail.label === "pin-snippet") {
        menu.groups = [{label: "Packages", buttons: [snippetEntry([{label: "New snippet", action: "user-snippet:new"}])]}]
        menu.requestUpdate()
      }
    })
    const actions = vi.fn()
    menu.addEventListener("ribbon-button-click", actions)
    const iconAction = menu.shadowRoot!.querySelector<HTMLButtonElement>('.icon-action-trigger[aria-label="Add snippet"]')!
    iconAction.click()
    await menu.updateComplete
    let main = menu.shadowRoot!.querySelector<HTMLButtonElement>('.item[title="Snippets"]')!
    expect(main.getAttribute("aria-expanded")).toBe("true")
    expect(menu.shadowRoot!.querySelector(".submenu")?.textContent).toContain("New snippet")
    iconAction.click()
    await menu.updateComplete
    main = menu.shadowRoot!.querySelector<HTMLButtonElement>('.item[title="Snippets"]')!
    expect(main.getAttribute("aria-expanded")).toBe("true")
    expect(actions.mock.calls.filter(([event]) => event.detail.label === "pin-snippet")).toHaveLength(2)
    main.click()
    await menu.updateComplete
    expect(main.getAttribute("aria-expanded")).toBe("false")
    menu.shadowRoot!.querySelector<HTMLButtonElement>(".item-row .submenu-toggle")!.click()
    await menu.updateComplete
    expect(menu.shadowRoot!.querySelector<HTMLButtonElement>('.item[title="Snippets"]')!.getAttribute("aria-expanded")).toBe("true")
  })

  it("keeps the actual collapsed package menu open after pinning a snippet", async () => {
    const ribbon = new AppRibbon()
    ribbon.consoleOpen = true
    ribbon.expanded = false
    ribbon.menuOpen = true
    document.body.append(ribbon)
    await ribbon.updateComplete
    let rootMenu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await rootMenu.updateComplete
    rootMenu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
    await rootMenu.updateComplete
    let packages = rootMenu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    await packages.updateComplete
    const actions = vi.fn()
    ribbon.addEventListener("ribbon-button-click", event => {
      actions(event)
      if((event as CustomEvent).detail.label === "pin-snippet") {
        ribbon.settings.userSnippets = [{id: "saved", label: "Saved snippet", html: "<p>saved</p>"}]
        ribbon.requestUpdate()
      }
    })
    packages.shadowRoot!.querySelector<HTMLButtonElement>('.icon-action-trigger[aria-label="Add snippet"]')!.click()
    await ribbon.updateComplete
    expect(ribbon.menuOpen).toBe(true)
    rootMenu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await rootMenu.updateComplete
    packages = rootMenu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    await packages.updateComplete
    let main = packages.shadowRoot!.querySelector<HTMLButtonElement>('.item[title="Snippets"]')!
    expect(main.getAttribute("aria-expanded")).toBe("true")
    const savedSnippets = packages.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    await savedSnippets.updateComplete
    expect(savedSnippets.shadowRoot!.querySelector('.item[title="Saved snippet"]')).not.toBeNull()
    packages.shadowRoot!.querySelector<HTMLButtonElement>('.icon-action-trigger[aria-label="Add snippet"]')!.click()
    await ribbon.updateComplete
    expect(ribbon.menuOpen).toBe(true)
    expect(actions.mock.calls.filter(([event]) => (event as CustomEvent).detail.label === "pin-snippet")).toHaveLength(2)
    rootMenu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await rootMenu.updateComplete
    packages = rootMenu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    await packages.updateComplete
    main = packages.shadowRoot!.querySelector<HTMLButtonElement>('.item[title="Snippets"]')!
    expect(main.getAttribute("aria-expanded")).toBe("true")
    main.click()
    await packages.updateComplete
    expect(packages.shadowRoot!.querySelector<HTMLButtonElement>('.item[title="Snippets"]')!.getAttribute("aria-expanded")).toBe("false")
    packages.shadowRoot!.querySelector<HTMLButtonElement>(".item-row .submenu-toggle")!.click()
    await packages.updateComplete
    expect(packages.shadowRoot!.querySelector<HTMLButtonElement>('.item[title="Snippets"]')!.getAttribute("aria-expanded")).toBe("true")
  })

  it.each([true, false])("completely removes uninstalled developer entries from ribbon lists (expanded: %s)", async expanded => {
    const ribbon = new AppRibbon()
    const local = packageFixture("local")
    const git = {...packageFixture("git"), developerSource: {kind: "git" as const, repository: "https://example.test/repo.git", ref: "main", path: "", commit: "abc"}}
    const published = packageFixture("published")
    ribbon.localPackages = [local, git]
    ribbon.installedPackages = [local, git]
    ribbon.packages = [local, git, published]
    ribbon.expanded = expanded
    ribbon.menuOpen = true
    document.body.append(ribbon)
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    if(!expanded) {
      await menu.updateComplete
      menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
    }
    const labels = async () => {
      await ribbon.updateComplete
      if(expanded) return [...ribbon.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button')].filter(button => button.label !== "Snippets").map(button => button.label)
      await menu.updateComplete
      const submenu = menu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
      await submenu.updateComplete
      return [...submenu.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item:not(.remove)")].map(button => button.title).filter(label => label !== "Snippets")
    }
    expect(await labels()).toEqual(["Local", "Git", "Published"])
    ribbon.installedPackages = []
    expect(await labels()).toEqual(["Published"])
    ribbon.shadowRoot!.querySelector("package-search")!.dispatchEvent(new CustomEvent("package-search-change", {detail: {query: "local"}}))
    expect(await labels()).toEqual([])
    ribbon.shadowRoot!.querySelector("package-search")!.dispatchEvent(new CustomEvent("package-search-change", {detail: {query: ""}}))
    ribbon.installedPackages = [git]
    expect(await labels()).toEqual(["Git", "Published"])
    expect(ribbon.localPackages).toEqual([local, git])
  })

  it("highlights the console selection only while the console is open", async () => {
    const ribbon = new AppRibbon()
    const local = packageFixture("local")
    const git = {...packageFixture("git"), developerSource: {kind: "git" as const, repository: "https://example.test/repo.git", ref: "main", path: "", commit: "abc"}}
    ribbon.localPackages = [local, git]
    ribbon.installedPackages = [local, git, packageFixture("published")]
    document.body.append(ribbon)
    await ribbon.updateComplete
    const buttons = () => Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button')).filter(button => button.label !== "Snippets")
    const selected = () => buttons().filter(button => button.hasAttribute("console-selected")).map(button => button.label)
    expect(selected()).toEqual([])
    ribbon.consoleOpen = true
    await ribbon.updateComplete
    expect(selected()).toEqual(["Local"])
    ribbon.selectedLocalPackageName = git.name
    await ribbon.updateComplete
    await Promise.all(buttons().map(button => button.updateComplete))
    expect(selected()).toEqual(["Git"])
    expect(getComputedStyle(buttons()[1].shadowRoot!.querySelector(".button-row")!).backgroundColor).not.toBe("#dbe7f2")
    const labelStyle = getComputedStyle(buttons()[1].shadowRoot!.querySelector(".button-label-text")!)
    expect(labelStyle.textDecorationLine).toBe("underline")
    expect(labelStyle.textDecorationColor).toBe("#8eb6df")
    expect(getComputedStyle(buttons()[1].shadowRoot!.querySelector(".button-row")!).opacity).toBe("1")
    ribbon.consoleOpen = false
    await ribbon.updateComplete
    await Promise.all(buttons().map(button => button.updateComplete))
    expect(selected()).toEqual([])
    expect(getComputedStyle(buttons()[1].shadowRoot!.querySelector(".button-label-text")!).textDecorationLine).not.toBe("underline")
    expect(buttons()[0].active).toBe(true)
  })

  it("updates the selected entry in the collapsed package menu", async () => {
    const ribbon = new AppRibbon()
    ribbon.localPackages = [packageFixture("local"), packageFixture("other")]
    ribbon.installedPackages = [...ribbon.localPackages, packageFixture("published")]
    ribbon.consoleOpen = true
    ribbon.expanded = false
    ribbon.menuOpen = true
    document.body.append(ribbon)
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
    const selected = async () => {
      await ribbon.updateComplete
      await menu.updateComplete
      const packages = menu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
      await packages.updateComplete
      const rows = Array.from(packages.shadowRoot!.querySelectorAll(".item-row.selected"))
      for(const row of rows) {
        expect(getComputedStyle(row).backgroundColor).not.toBe("#dbe7f2")
        const labelStyle = getComputedStyle(row.querySelector(".item-label")!)
        expect(labelStyle.textDecorationLine).toBe("underline")
        expect(labelStyle.textDecorationColor).toBe("#8eb6df")
      }
      return rows.map(row => row.querySelector<HTMLButtonElement>(".item")!.title)
    }
    expect(await selected()).toEqual(["Local"])
    ribbon.selectedLocalPackageName = ribbon.localPackages[1].name
    expect(await selected()).toEqual(["Other"])
    ribbon.consoleOpen = false
    expect(await selected()).toEqual([])
  })

  it("places developer packages first, keeps their metadata and italicizes only their names", async () => {
    const ribbon = new AppRibbon()
    const local = {...packageFixture("local"), developerSource: {kind: "local" as const, path: "local-folder"}}
    const git = {...packageFixture("git"), developerSource: {kind: "git" as const, repository: "https://example.test/repo.git", ref: "main", path: "", commit: "abc"}}
    const installed = packageFixture("installed")
    ribbon.localPackages = [local, git]
    ribbon.installedPackages = [installed, {...local, label: "Old local"}, git]
    ribbon.packages = [packageFixture("catalog"), {...local, label: "Published local"}]
    document.body.append(ribbon)
    await ribbon.updateComplete
    const buttons = () => Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button')).filter(button => button.label !== "Snippets")
    expect(buttons().map(button => button.label)).toEqual(["Local", "Git", "Installed", "Catalog"])
    await Promise.all(buttons().map(button => button.updateComplete))
    expect(buttons().map(button => button.hasAttribute("developer-package"))).toEqual([true, true, false, false])
    expect(getComputedStyle(buttons()[0].shadowRoot!.querySelector(".button-label-text")!).fontStyle).toBe("italic")
    expect(getComputedStyle(buttons()[2].shadowRoot!.querySelector(".button-label-text")!).fontStyle).not.toBe("italic")
    ribbon.shadowRoot!.querySelector("package-search")!.dispatchEvent(new CustomEvent("package-search-change", {detail: {query: "git"}}))
    await ribbon.updateComplete
    expect(buttons().map(button => button.label)).toEqual(["Git"])
  })

  it("puts developer packages first with italic labels in the collapsed package menu", async () => {
    const ribbon = new AppRibbon()
    const local = packageFixture("local")
    ribbon.localPackages = [local]
    ribbon.installedPackages = [packageFixture("installed"), local]
    ribbon.packages = [packageFixture("catalog")]
    ribbon.expanded = false
    ribbon.menuOpen = true
    document.body.append(ribbon)
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
    await menu.updateComplete
    const packages = menu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
    await packages.updateComplete
    const items = Array.from(packages.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item:not(.remove)")).filter(item => item.title !== "Snippets")
    expect(items.map(item => item.title)).toEqual(["Local", "Installed", "Catalog"])
    expect(getComputedStyle(items[0].querySelector(".item-label")!).fontStyle).toBe("italic")
    expect(getComputedStyle(items[1].querySelector(".item-label")!).fontStyle).not.toBe("italic")
  })

  it.each([true, false])("replaces the busy package icon with a spinner and restores it afterward (image: %s)", async image => {
    const ribbon = new AppRibbon()
    const pkg = packageFixture()
    if(!image) pkg.iconUrl = undefined
    ribbon.packages = [pkg, packageFixture("other")]
    document.body.append(ribbon)
    await ribbon.updateComplete
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Demo"]')!
    const other = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Other"]')!

    ribbon.busyPackageNames = [pkg.name]
    await ribbon.updateComplete
    await Promise.all([button.updateComplete, other.updateComplete])
    expect(button.shadowRoot!.querySelector(".button-icon.icon-loading")).not.toBeNull()
    expect(button.shadowRoot!.querySelector(".button-icon svg")).toBeNull()
    expect(button.shadowRoot!.querySelector(".button-icon img")).toBeNull()
    expect(button.shadowRoot!.querySelector(".main-button")!.getAttribute("aria-busy")).toBe("true")
    expect(button.disabled).toBe(true)
    expect(other.shadowRoot!.querySelector(".icon-loading")).toBeNull()

    ribbon.busyPackageNames = []
    await ribbon.updateComplete
    await button.updateComplete
    expect(button.shadowRoot!.querySelector(".icon-loading")).toBeNull()
    expect(button.shadowRoot!.querySelector(".button-icon svg")).not.toBeNull()
    expect(Boolean(button.shadowRoot!.querySelector(".button-icon img"))).toBe(image)
    expect(button.shadowRoot!.querySelector(".main-button")!.hasAttribute("aria-busy")).toBe(false)
    expect(button.disabled).toBe(false)
  })

  it("requests a catalog refresh without changing the search query", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const search = ribbon.shadowRoot!.querySelector("package-search")!
    search.query = "physics"
    await search.updateComplete
    const request = vi.fn()
    ribbon.addEventListener("package-catalog-request", request)
    const refresh = search.shadowRoot!.querySelector<HTMLButtonElement>(".refresh")!
    expect(refresh.title).toBe("Refresh list")
    expect(refresh.getAttribute("aria-label")).toBe("Refresh list")
    expect(refresh.querySelector(".icon-tabler-refresh")).not.toBeNull()
    refresh.click()
    expect(request).toHaveBeenCalledTimes(1)
    expect(request.mock.calls[0][0].detail).toEqual({refresh: true})
    expect(search.query).toBe("physics")

    search.loading = true
    await search.updateComplete
    expect(refresh.disabled).toBe(true)
    refresh.click()
    expect(request).toHaveBeenCalledTimes(1)
  })

  it("keeps dependency refresh out of package controls", async () => {
    const ribbon = new AppRibbon()
    const pkg = packageFixture()
    pkg.manifest = {name: pkg.name, version: pkg.version}
    ribbon.installedPackages = [pkg]
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    expect(drawer.hasAttribute("expandable")).toBe(false)
    expect(drawer.textContent).not.toContain("Refresh dependencies")

    ribbon.expanded = false
    ribbon.menuOpen = true
    await ribbon.updateComplete
    const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
    await menu.updateComplete
    expect(menu.textContent).not.toContain("Refresh dependencies")
  })

  it("replaces the search icon with a spinner while fetching packages", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const search = ribbon.shadowRoot!.querySelector("package-search")!
    await search.updateComplete
    expect(search.shadowRoot!.querySelector(".icon-tabler-search")).not.toBeNull()

    ribbon.packagesLoading = true
    await ribbon.updateComplete
    await search.updateComplete
    expect(search.shadowRoot!.querySelector(".icon-tabler-search")).toBeNull()
    expect(search.shadowRoot!.querySelector(".icon.loading")).not.toBeNull()
    expect(search.shadowRoot!.querySelector("input")!.getAttribute("aria-busy")).toBe("true")

    ribbon.packagesLoading = false
    ribbon.packageError = "Catalog unavailable"
    await ribbon.updateComplete
    await search.updateComplete
    expect(search.shadowRoot!.querySelector(".loading")).toBeNull()
    expect(search.shadowRoot!.querySelector(".icon-tabler-search")).not.toBeNull()
    expect(search.shadowRoot!.querySelector("input")!.getAttribute("aria-busy")).toBe("false")
  })

  it("preserves installed package order and metadata when the catalog arrives", async () => {
    const ribbon = new AppRibbon()
    const beta = packageFixture("beta")
    const alpha = packageFixture("alpha")
    const missing = packageFixture("missing")
    ribbon.installedPackages = [beta, missing, alpha]
    ribbon.packagesLoading = true
    document.body.append(ribbon)
    await ribbon.updateComplete
    const labels = () => Array.from(
      ribbon.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-drawer[label="Packages"] ribbon-button'),
      button => button.label,
    ).filter(label => label !== "Snippets")
    expect(labels()).toEqual(["Beta", "Missing", "Alpha"])

    ribbon.packages = [packageFixture("available"), {...alpha, label: "New Alpha"}, {...beta, label: "New Beta"}]
    ribbon.packagesLoading = false
    await ribbon.updateComplete
    expect(labels()).toEqual(["Beta", "Missing", "Alpha", "Available"])
  })

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
    expect(getComputedStyle(packageDrawer).flexShrink).toBe("1")
    expect(packageDrawer.layoutWidths.minimum).toBe(128)
  })

  it("uses full-column horizontal package buttons, search, and member menus", async () => {
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
    expect(getComputedStyle(controls).gridTemplateColumns).toContain("minmax(min(8rem, 100%), 1fr)")
    expect(getComputedStyle(controls).gap).toBe("0")
    expect(getComputedStyle(controls).paddingBottom).toBe("4px")
    expect(RibbonDrawer.styles.toString()).toMatch(/::slotted\(ribbon-button\)\s*\{\s*grid-column: auto;/)
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))")
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
    const labels = () => Array.from(drawer.querySelectorAll<RibbonButton>("ribbon-button"), button => button.label).filter(label => label !== "Snippets")
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

  it.each([
    [110, 2], [240, 2], [255, 2], [256, 5], [383, 5], [384, 8], [462.4, 8], [512, 11],
  ])("keeps three rows at %s pixels with %s visible packages", async (width, count) => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.packages = Array.from({length: 15}, (_, index) => packageFixture(`package-${index + 1}`))
    document.body.append(ribbon)
    await ribbon.updateComplete

    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    Object.defineProperty(controls, "getBoundingClientRect", {
      value: () => ({width}),
      configurable: true,
    })
    ;(ribbon as unknown as {updatePackageCapacity(): void}).updatePackageCapacity()
    await ribbon.updateComplete

    expect(drawer.querySelectorAll('ribbon-button:not([slot="more"])')).toHaveLength(count)
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(16 - count)
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))")
  })

  it.each([[256, 5], [384, 8], [512, 11]])("keeps snippets within the three-row package capacity at %s pixels", async (width, count) => {
    const ribbon = new AppRibbon()
    ribbon.settings.userSnippets = [{id: "saved", label: "Saved", html: "<p>Saved</p>"}]
    ribbon.packages = Array.from({length: 15}, (_, index) => packageFixture(`package-${index + 1}`))
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    const controls = drawer.shadowRoot!.querySelector<HTMLElement>(".controls")!
    vi.spyOn(controls, "getBoundingClientRect").mockReturnValue({width} as DOMRect)
    ;(ribbon as unknown as {updatePackageCapacity(): void}).updatePackageCapacity()
    await ribbon.updateComplete
    expect(drawer.querySelectorAll('ribbon-button:not([slot="more"])')).toHaveLength(count)
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(16 - count)
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

    expect(drawer.packageColumnCount).toBe(1)
    expect(drawer.querySelectorAll('ribbon-button:not([slot="more"])')).toHaveLength(2)
    expect(drawer.querySelectorAll('ribbon-button[slot="more"]')).toHaveLength(2)
    expect(getComputedStyle(controls).gridTemplateRows).toBe("repeat(3, minmax(0, 1fr))")
    expect(RibbonDrawer.styles.toString()).toMatch(/::slotted\(package-search\)\s*\{\s*grid-column: auto;/)
    expect(RibbonDrawer.styles.toString()).toMatch(/::slotted\(ribbon-button\)\s*\{\s*grid-column: auto;/)
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
    alpha = drawer.querySelector<RibbonButton>('ribbon-button[label="Alpha"]')!
    await alpha.updateComplete
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

  it("focuses package search when expanding the drawer", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    ribbon.packages = [packageFixture("alpha"), packageFixture("beta"), packageFixture("gamma")]
    ;(ribbon as unknown as {packageVisibleCount: number}).packageVisibleCount = 1
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Packages"]')!
    await drawer.updateComplete
    const search = drawer.querySelector("package-search")!
    await search.updateComplete
    const input = search.shadowRoot!.querySelector<HTMLInputElement>("input")!
    const toggle = drawer.shadowRoot!.querySelector<HTMLButtonElement>(".drawer-toggle")!
    toggle.focus()
    toggle.click()
    await drawer.updateComplete
    await ribbon.updateComplete

    expect(drawer.hasAttribute("drawer-open")).toBe(true)
    expect(search.shadowRoot!.activeElement).toBe(input)

    toggle.focus()
    toggle.click()
    await drawer.updateComplete
    expect(drawer.hasAttribute("drawer-open")).toBe(false)
    expect(drawer.shadowRoot!.activeElement).toBe(toggle)
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
    const currentButton = drawer.querySelector<RibbonButton>('ribbon-button[label="Alpha"]')!
    await currentButton.updateComplete

    expect(action.mock.calls[0][0].detail).toEqual({label: "package:@webwriter/alpha", keepDrawerOpen: true})
    expect(drawer.hasAttribute("drawer-open")).toBe(true)

    currentButton.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Remove Alpha"]')!.click()
    expect(action.mock.calls.at(-1)?.[0].detail).toEqual({label: "package-toggle:@webwriter/alpha", keepDrawerOpen: true})
    expect(RibbonButton.styles.toString()).toMatch(
      /:host\(\[variant="package"\]\) \.corner-trigger\s*\{[\s\S]*?aspect-ratio:\s*1\s*\/\s*1;/,
    )
  })
})


it("keeps package search, refresh, removal and member insertion available in the collapsed menu", async () => {
  const ribbon = new AppRibbon()
  const pkg = packageFixture()
  ribbon.packages = [pkg, packageFixture("other")]
  ribbon.installedPackages = [pkg]
  ribbon.expanded = false
  ribbon.menuOpen = true
  document.body.append(ribbon)
  await ribbon.updateComplete
  const menu = ribbon.shadowRoot!.querySelector<RibbonMenu>("ribbon-menu")!
  await menu.updateComplete
  menu.shadowRoot!.querySelector<HTMLButtonElement>('[title="Packages"]')!.click()
  await menu.updateComplete
  const packages = menu.shadowRoot!.querySelector<RibbonMenu>(".submenu ribbon-menu")!
  await packages.updateComplete
  const remove = packages.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Remove Demo"]')!
  expect(remove.nextElementSibling?.getAttribute("aria-label")).toBe("Show more Demo options")
  expect(packages.shadowRoot!.querySelector('[aria-label="Remove Other"]')).toBeNull()
  const search = menu.shadowRoot!.querySelector("package-search")!
  await search.updateComplete
  const input = search.shadowRoot!.querySelector<HTMLInputElement>("input")!
  input.value = "demo"
  input.dispatchEvent(new Event("input", {bubbles: true}))
  await ribbon.updateComplete
  await menu.updateComplete
  await packages.updateComplete
  expect(packages.shadowRoot!.querySelector('[title="Other"]')).toBeNull()
  const requests = vi.fn()
  ribbon.addEventListener("package-catalog-request", requests)
  await search.updateComplete
  search.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Refresh list"]')!.click()
  expect(requests.mock.calls[0][0].detail).toEqual({refresh: true})
  expect(search.query).toBe("demo")
  packages.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Show more Demo options"]')!.click()
  await packages.updateComplete
  expect(packages.shadowRoot!.querySelector(".submenu")?.textContent).toContain("demo Snippet")
  const commands = vi.fn()
  ribbon.addEventListener("ribbon-button-click", commands)
  remove.click()
  expect(commands.mock.calls[0][0].detail.label).toBe("package-toggle:@webwriter/demo")
})
