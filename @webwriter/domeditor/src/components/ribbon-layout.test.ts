// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonDrawer} from "./ribbon-drawer"
import {contextDrawerPolicy} from "./ribbon-menu-config"

afterEach(() => document.body.replaceChildren())

describe("element drawer without layout presets", () => {
  it("uses five columns and keeps Formula in the marks drawer", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete
    const drawer = ribbon.shadowRoot!.querySelector<RibbonDrawer>('ribbon-drawer[label="Elements"]')!
    await drawer.updateComplete
    expect(drawer.expandable).toBe(false)
    expect(drawer.layoutWidths.expanded).toBeCloseTo(298.4)
    expect(getComputedStyle(drawer.shadowRoot!.querySelector(".elements-primary-controls")!).gridTemplateColumns)
      .toBe("repeat(5, minmax(0, 1fr))")
    expect(drawer.querySelector('.layout-opener, .layout-gallery, ribbon-button[label="Formula"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Marks"] ribbon-button[label="Formula"]')).not.toBeNull()
  })

  it.each(["grid", "flex", "columns"] as const)("does not offer old layout controls for %s content", kind => {
    const groups = contextDrawerPolicy({menu: "Edit", surface: "toolbox", activeTool: "Edit", layout: kind, attributes: true})
    expect(groups.map(group => group.label)).toEqual(["Attributes"])
  })
})
