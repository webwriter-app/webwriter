// @vitest-environment happy-dom
import {afterEach, describe, expect, it, vi} from "vitest"
import {mathStructureOptions, mathToolGroups} from "../math"
import {contextDrawerPolicy} from "./ribbon-menu-config"
import {AppRibbon} from "./ribbon"
import {DomEditorToolbox} from "./toolbox"
import type {RibbonButton} from "./ribbon-button"

afterEach(() => document.body.replaceChildren())

const mathState = {active: true as const, display: "inline" as const}

describe("formula toolbox controls", () => {
  it("offers one root structure with an optional index", () => {
    const roots = mathStructureOptions.filter(option => /root/i.test(option.title))
    expect(roots).toEqual([{
      command: "structure:root", label: "ⁿ√□", title: "Root",
    }])
  })

  it("offers every structure through the Formula button's normal dropdown", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const formula = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Formula"]')!
    await formula.updateComplete
    expect(formula.dropdown).toBeNull()
    expect(formula.submenu.map(item => typeof item === "string" ? item : item.label))
      .toEqual(mathStructureOptions.map(option => option.title))
    formula.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "Formula", keepDrawerOpen: false}}))

    formula.shadowRoot!.querySelector<HTMLButtonElement>(".submenu-trigger")!.click()
    await formula.updateComplete
    const menu = formula.shadowRoot!.querySelector("ribbon-menu")!
    await menu.updateComplete
    expect(menu.hidden).toBe(false)
    for(const option of mathStructureOptions) {
      const button = menu.shadowRoot!.querySelector<HTMLButtonElement>(`button[title="${option.title}"]`)!
      const icon = button.querySelector(".item-icon")!
      expect(icon.textContent).toBe(option.label)
      expect(icon.querySelector("svg")).toBeNull()
    }
    menu.shadowRoot!.querySelector<HTMLButtonElement>('button[title="Fraction"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "insert-math:frac"}}))

    const media = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[slot="compact"][label="Media"]')!
    const compactFormula = media.submenu.find(item => typeof item !== "string" && item.label === "Formula")
    expect(typeof compactFormula === "object" && compactFormula.submenu).toEqual(formula.submenu)
  })

  it("keeps other menus available while a formula is selected", () => {
    expect(contextDrawerPolicy({menu: "Edit", surface: "toolbox", activeTool: "Style", math: true})
      .some(group => group.label === "Formula")).toBe(false)
    expect(contextDrawerPolicy({menu: "Start", surface: "ribbon", math: true})
      .some(group => group.label === "Formula")).toBe(false)
  })
  it.each(["Start", "Edit"] as const)("keeps the %s ribbon unchanged while math editing is active", async menu => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = menu
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawerLabels = () => Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label"))
    const initial = drawerLabels()

    ribbon.math = mathState
    await ribbon.updateComplete
    expect(drawerLabels()).toEqual(initial)
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Formula"]')).toBeNull()
    expect(contextDrawerPolicy({menu, surface: "ribbon", math: true}))
      .toEqual(contextDrawerPolicy({menu, surface: "ribbon"}))
  })

  it("renders grouped math tools and dispatches their commands", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.math = mathState
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete

    const drawer = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Formula"]')!
    expect(drawer.querySelectorAll('.math-tool-groups button')).toHaveLength(
      mathToolGroups.reduce((count, group) => count + group.options.length, 0),
    )
    expect(drawer.querySelector('[data-action^="math:move:"], [data-action^="math:delete:"], [data-action="math:exit"]')).toBeNull()
    const option = mathToolGroups[0].options[0]
    const button = drawer.querySelector<HTMLButtonElement>(`button.math-button[data-action="math:${option.command}"]`)!
    expect(button.textContent).toBe(option.label)
    expect(button.title).toBe(option.title)
    expect(button.getAttribute("aria-label")).toBe(option.title)
    expect(drawer.querySelector('[aria-label="Formula keyboard shortcuts"]')).toBeNull()
    const groups = Array.from(drawer.querySelectorAll(".math-tool-group h3"), heading => heading.textContent)
    expect(groups.slice(-2)).toEqual(["Greek letters", "Letters"])
    button.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: `math:${option.command}`, keepDrawerOpen: false},
    }))
  })

  it("prioritizes Formula in the toolbox context", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.math = mathState
    document.body.append(toolbox)
    await toolbox.updateComplete

    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Formula"]')).not.toBeNull()
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Attributes"]')).toBeNull()

    toolbox.math = null
    await toolbox.updateComplete
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Formula"]')).toBeNull()
  })
})
