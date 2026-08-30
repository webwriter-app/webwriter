// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import {DomEditorToolbox} from "./toolbox"

beforeEach(() => document.body.replaceChildren())

describe("table controls", () => {
  it("removes the Table drawer from Start and keeps it in the Edit toolbox", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete

    const ribbonLabels = Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label"))
    expect(ribbonLabels).not.toContain("Table")

    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    document.body.append(toolbox)
    await toolbox.updateComplete
    const toolboxLabels = Array.from(toolbox.shadowRoot!.querySelectorAll("ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label"))
    expect(toolboxLabels).toEqual(["Table"])
  })

  it("offers a 10 by 10 insertion grid and dispatches the chosen size", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const listener = vi.fn()
    ribbon.addEventListener("table-insert", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const button = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Table"]',
    )!
    await button.updateComplete
    const options = button.shadowRoot!.querySelectorAll<HTMLButtonElement>(".table-size-cell")

    expect(options).toHaveLength(100)
    options[23].dispatchEvent(new PointerEvent("pointerenter", {bubbles: true, composed: true}))
    options[23].click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {rows: 3, columns: 4}}))
  })

  it("enables structural commands from DOM-derived table state", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {
      active: true,
      cellSelection: true,
      rows: 2,
      columns: 2,
      selectedCells: 4,
      canMerge: true,
      canSplit: false,
      hasCaption: false,
    }
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const merge = toolbox.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Table"] ribbon-button[label="Merge cells"]',
    )!
    const split = toolbox.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Table"] ribbon-button[label="Split cells"]',
    )!
    await merge.updateComplete

    expect(merge.disabled).toBe(false)
    expect(split.disabled).toBe(true)
    merge.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "table-merge-cells", keepDrawerOpen: false},
    }))
  })

  it("dispatches cell border and background style changes", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {
      active: true, cellSelection: true, rows: 1, columns: 1, selectedCells: 1,
      canMerge: false, canSplit: false, hasCaption: false,
    }
    const listener = vi.fn()
    toolbox.addEventListener("table-style-change", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const border = toolbox.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Table"] ribbon-button[label="Borders"]',
    )!
    const background = toolbox.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Table"] ribbon-button[label="Background"]',
    )!
    await border.updateComplete
    await background.updateComplete
    const style = border.shadowRoot!.querySelector<HTMLSelectElement>('select')!
    style.value = "dashed"
    style.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    const color = background.shadowRoot!.querySelector<HTMLInputElement>('input[type="color"]')!
    color.value = "#ff0000"
    color.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {property: "border-style", value: "dashed"},
    }))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {property: "background-color", value: "#ff0000"},
    }))
  })
})
