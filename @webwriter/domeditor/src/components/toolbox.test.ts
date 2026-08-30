// @vitest-environment happy-dom
import {afterEach, describe, expect, it} from "vitest"
import {DomEditorToolbox} from "./toolbox"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"

afterEach(() => {
  document.body.replaceChildren()
})

async function mountToolbox() {
  const toolbox = new DomEditorToolbox()
  document.body.append(toolbox)
  await toolbox.updateComplete
  return toolbox
}

const toolButton = (toolbox: DomEditorToolbox, label: string) =>
  toolbox.shadowRoot!.querySelector<HTMLButtonElement>(`button[data-tool="${label}"]`)!

describe("toolbox", () => {
  it("renders Edit, Style, Review, and Develop as icon-only tabs on the breadcrumb baseline", async () => {
    const toolbox = await mountToolbox()
    const tablist = toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-tabs")!
    const tabs = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab"))
    const buttons = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".toolbox-tab-button"))
    const labels = Array.from(toolbox.shadowRoot!.querySelectorAll<HTMLElement>(".toolbox-tab-label"))

    expect(buttons.map(button => button.getAttribute("aria-label"))).toEqual([
      "Edit", "Style", "Review", "Develop",
    ])
    expect(buttons.map(button => button.getAttribute("aria-selected"))).toEqual([
      "false", "false", "false", "false",
    ])
    expect(labels.map(label => label.textContent)).toEqual(["Edit", "Style", "Review", "Develop"])
    expect(labels.every(label => getComputedStyle(label).opacity === "0")).toBe(true)
    expect(tabs.every(tab => getComputedStyle(tab).width === "28px")).toBe(true)
    expect(getComputedStyle(tablist).borderBottomWidth).toBe("0.5px")
    expect(getComputedStyle(tablist).borderBottomColor).toBe("#a8a8a8")
    expect(buttons[0].querySelector(".icon-tabler-pencil")).not.toBeNull()
    expect(buttons[1].querySelector(".icon-tabler-palette")).not.toBeNull()
    expect(buttons[2].querySelector(".icon-tabler-text-grammar")).not.toBeNull()
    expect(buttons[3].querySelector(".icon-tabler-terminal-2")).not.toBeNull()
  })

  it("widens the active tab and narrows it when switching or closing", async () => {
    const toolbox = await mountToolbox()
    const edit = toolButton(toolbox, "Edit")
    const style = toolButton(toolbox, "Style")
    const editTab = edit.closest<HTMLElement>(".toolbox-tab")!
    const styleTab = style.closest<HTMLElement>(".toolbox-tab")!

    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.shadowRoot!.querySelector<HTMLElement>(".toolbox-pane")!.hidden).toBe(true)

    edit.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Edit")
    expect(toolbox.getAttribute("active-tool")).toBe("Edit")
    expect(getComputedStyle(toolbox).width).toBe("300px")
    expect(edit.getAttribute("aria-selected")).toBe("true")
    expect(style.getAttribute("aria-selected")).toBe("false")
    expect(getComputedStyle(editTab).width).toBe("112px")
    expect(getComputedStyle(editTab).transition).toContain("width")
    expect(getComputedStyle(edit.querySelector<HTMLElement>(".toolbox-tab-label")!).opacity).toBe("1")
    const editClose = editTab.querySelector<HTMLButtonElement>(".toolbox-tab-close")!
    expect(editClose.disabled).toBe(false)
    expect(getComputedStyle(editClose).width).toBe("24px")
    expect(toolbox.shadowRoot!.querySelector(".pane-header")).toBeNull()

    style.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBe("Style")
    expect(edit.getAttribute("aria-selected")).toBe("false")
    expect(style.getAttribute("aria-selected")).toBe("true")
    expect(getComputedStyle(editTab).width).toBe("28px")
    expect(getComputedStyle(styleTab).width).toBe("112px")
    expect(editClose.disabled).toBe(true)

    styleTab.querySelector<HTMLButtonElement>(".toolbox-tab-close")!.click()
    await toolbox.updateComplete
    expect(toolbox.activeTool).toBeNull()
    expect(toolbox.hasAttribute("active-tool")).toBe(false)
    expect(getComputedStyle(styleTab).width).toBe("28px")
    expect(getComputedStyle(toolbox).width).toBe("122px")
  })

  it("names element-specific Edit tools in the active blue", async () => {
    const toolbox = await mountToolbox()
    const edit = toolButton(toolbox, "Edit")
    const editTab = edit.closest<HTMLElement>(".toolbox-tab")!
    const label = edit.querySelector<HTMLElement>(".toolbox-tab-label")!
    toolbox.table = {
      active: true,
      cellSelection: false,
      rows: 2,
      columns: 2,
      selectedCells: 1,
      canMerge: false,
      canSplit: false,
      hasCaption: false,
    }
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(edit.getAttribute("aria-label")).toBe("Edit Table")
    expect(label.hasAttribute("data-contextual")).toBe(true)
    expect(getComputedStyle(label).color).toBe("#3977c7")
    expect(getComputedStyle(label).opacity).toBe("1")
    expect(getComputedStyle(edit).color).toBe("#3977c7")
    expect(getComputedStyle(editTab).width).toBe("88px")

    edit.click()
    await toolbox.updateComplete
    expect(getComputedStyle(editTab).width).toBe("112px")

    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    expect(label.textContent).toBe("Table")
    expect(getComputedStyle(label).opacity).toBe("1")
    expect(getComputedStyle(edit).color).toBe("#3977c7")
    expect(getComputedStyle(editTab).width).toBe("88px")

    toolbox.table = null
    toolbox.graphic = {active: true, capture: false}
    await toolbox.updateComplete
    expect(label.textContent).toBe("Graphic")

    toolbox.graphic = null
    toolbox.selectionPath = [
      {path: [], name: "Document"},
      {path: [0], name: "Demo widget", icon: "Packages"},
    ]
    await toolbox.updateComplete
    expect(label.textContent).toBe("Widget")
    expect(edit.getAttribute("aria-label")).toBe("Edit Widget")

    toolbox.selectionPath = [{path: [], name: "Document"}, {path: [0], name: "Paragraph"}]
    await toolbox.updateComplete
    expect(label.textContent).toBe("Edit")
    expect(label.hasAttribute("data-contextual")).toBe(false)
    expect(edit.getAttribute("aria-label")).toBe("Edit")
  })

  it("separates Edit, Review, Style, and Develop into their pane-specific controls", async () => {
    const toolbox = await mountToolbox()

    toolButton(toolbox, "Edit").click()
    await toolbox.updateComplete
    let drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Marks", "Table", "Comments", "View"])
    expect(drawers.every(drawer => drawer.pane && !drawer.collapsed)).toBe(true)

    toolButton(toolbox, "Review").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual(["Review"])
    expect(Array.from(drawers[0].querySelectorAll<RibbonButton>("ribbon-button"))
      .map(button => button.label)).toEqual([
        "Spelling", "Grammar", "Translate",
        "Track Changes", "Accept", "Reject",
      ])

    toolButton(toolbox, "Style").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>('ribbon-drawer[layout="element-style"]'))
    expect(drawers.map(drawer => drawer.label)).toEqual([
      "Position & Form",
      "Layout",
      "Text",
      "Color & Visibility",
      "Interaction & Motion",
      "Other",
    ])
    expect(drawers.every(drawer => drawer.querySelectorAll("element-style-editor").length === 2)).toBe(true)

    toolButton(toolbox, "Develop").click()
    await toolbox.updateComplete
    drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    expect(drawers.map(drawer => drawer.label)).toEqual([
      "Local packages", "Metadata", "Development", "Exports",
    ])
  })
})
