// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import {DomEditorToolbox} from "./toolbox"

beforeEach(() => document.body.replaceChildren())

const semanticTableState = {
  selectedRowGroup: "tbody" as const,
  rowGroups: [],
  canAddHeaderGroup: true,
  canAddFooterGroup: true,
  columnGroups: [],
  cellSemantics: {role: "data" as const, headers: "", abbr: ""},
}

describe("table controls", () => {
  it("keeps the table controls in dedicated Edit toolbox drawers", async () => {
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
    expect(toolboxLabels).toEqual(["Layout", "Borders", "Background", "Semantics"])

    const actionIcons = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonButton>("ribbon-button"))
      .map(button => button.icon)
    expect(actionIcons).toEqual([
      "TableRowAbove", "TableRowBelow", "TableColumnLeft", "TableColumnRight",
      "TableMergeCells", "TableSplitCells", "TableSplit",
    ])
    expect(new Set(actionIcons).size).toBe(actionIcons.length)
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Layout"] input[type="checkbox"]')).not.toBeNull()
  })

  it("spaces table layout actions and keeps universal attributes at the bottom", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {
      ...semanticTableState,
      active: true,
      cellSelection: true,
      rows: 2,
      columns: 2,
      selectedCells: 1,
      canMerge: false,
      canSplit: false,
      hasCaption: false,
    }
    toolbox.elementAttributes = {
      path: [0, 0, 0],
      localName: "td",
      namespaceURI: "http://www.w3.org/1999/xhtml",
      name: "Table Cell",
      icon: "Table",
      attributes: {},
    }
    document.body.append(toolbox)
    await toolbox.updateComplete

    const drawers = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonDrawer>("ribbon-drawer"))
    await Promise.all(drawers.map(drawer => drawer.updateComplete))
    expect(drawers.map(drawer => drawer.label)).toEqual([
      "Layout", "Borders", "Background", "Semantics", "Attributes",
    ])
    const controls = drawers[0].shadowRoot!.querySelector<HTMLElement>(".controls")!
    expect(getComputedStyle(controls).gridAutoRows).toBe("minmax(3rem, auto)")
    expect(getComputedStyle(controls).gap).toBe("0.5rem")
    const semantics = drawers.find(drawer => drawer.label === "Semantics")!
    expect(getComputedStyle(semantics.querySelector<HTMLElement>(".table-semantic-controls")!).gridColumn)
      .toBe("1 / -1")
    const attributes = drawers.find(drawer => drawer.label === "Attributes")!
    expect(getComputedStyle(attributes.querySelector<HTMLElement>("element-attribute-editor")!).gridColumn)
      .toBe("1 / -1")
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
      ...semanticTableState,
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
      'ribbon-drawer[label="Layout"] ribbon-button[label="Merge cells"]',
    )!
    const split = toolbox.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Layout"] ribbon-button[label="Split cells"]',
    )!
    await merge.updateComplete

    expect(merge.disabled).toBe(false)
    expect(split.disabled).toBe(true)
    merge.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {label: "table-merge-cells", keepDrawerOpen: false},
    }))
  })

  it("renders Caption as a checkbox reflecting and toggling table state", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {
      ...semanticTableState,
      active: true, cellSelection: true, rows: 1, columns: 1, selectedCells: 1,
      canMerge: false, canSplit: false, hasCaption: true,
    }
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete

    const caption = toolbox.shadowRoot!.querySelector<HTMLInputElement>(
      'ribbon-drawer[label="Layout"] input[type="checkbox"]',
    )!
    expect(caption.checked).toBe(true)
    caption.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "table-caption"}}))
  })

  it("shows cell border and background options top-level and dispatches changes", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {
      ...semanticTableState,
      active: true, cellSelection: true, rows: 1, columns: 1, selectedCells: 1,
      canMerge: false, canSplit: false, hasCaption: false,
    }
    const listener = vi.fn()
    toolbox.addEventListener("table-style-change", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const border = toolbox.shadowRoot!.querySelector<HTMLElement>(
      'ribbon-drawer[label="Borders"]',
    )!
    const background = toolbox.shadowRoot!.querySelector<HTMLElement>(
      'ribbon-drawer[label="Background"]',
    )!
    expect(border.querySelector("ribbon-button")).toBeNull()
    expect(background.querySelector("ribbon-button")).toBeNull()
    const style = border.querySelector<HTMLSelectElement>('select')!
    style.value = "dashed"
    style.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    const color = background.querySelector<HTMLInputElement>('input[type="color"]')!
    color.value = "#ff0000"
    color.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {property: "border-style", value: "dashed"},
    }))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({
      detail: {property: "background-color", value: "#ff0000"},
    }))
  })

  it("presents semantic row, column, and cell concepts and dispatches guarded edits", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {
      active: true,
      cellSelection: true,
      rows: 2,
      columns: 2,
      selectedCells: 2,
      canMerge: true,
      canSplit: false,
      hasCaption: false,
      selectedRowGroup: "tbody",
      rowGroups: [
        {index: 0, type: "thead", rows: 1, attributes: {"data-kind": "heading"}},
        {index: 1, type: "tbody", rows: 1, attributes: {}},
      ],
      canAddHeaderGroup: false,
      canAddFooterGroup: true,
      columnGroups: [{
        path: [0],
        attributes: {span: "2"},
        columns: [],
      }],
      cellSemantics: {role: "column-header", headers: "group", abbr: "Col"},
    }
    const listener = vi.fn()
    toolbox.addEventListener("table-semantic-action", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const semantics = toolbox.shadowRoot!.querySelector<HTMLElement>('ribbon-drawer[label="Semantics"]')!

    const rows = semantics.querySelector<HTMLSelectElement>('select[aria-label="Selected rows: Group"]')!
    expect(rows.value).toBe("tbody")
    rows.value = "tfoot"
    rows.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {action: "convert-rows", group: "tfoot"}}))

    expect(Array.from(semantics.querySelectorAll<HTMLButtonElement>(".table-semantic-add-grid button"))
      .find(button => button.textContent === "Add header")?.disabled).toBe(true)
    semantics.querySelector<HTMLButtonElement>('button[aria-label="Move body group up"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      action: "move-row-group", index: 1, expected: {}, direction: -1,
    }}))

    const span = semantics.querySelector<HTMLInputElement>('input[aria-label="Column group 1: Span"]')!
    expect(span.value).toBe("2")
    span.value = "3"
    span.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      action: "set-column-span", path: [0], expected: {span: "2"}, value: "3",
    }}))

    const role = semantics.querySelector<HTMLSelectElement>('select[aria-label="Selected cells: Role"]')!
    expect(role.value).toBe("column-header")
    role.value = "row-header"
    role.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      action: "set-cell-role", role: "row-header",
    }}))
    const headers = semantics.querySelector<HTMLInputElement>('input[aria-label="Selected cells: Associated header IDs"]')!
    expect(headers.value).toBe("group")
    headers.value = "name value"
    headers.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {
      action: "set-cell-attribute", attribute: "headers", value: "name value",
    }}))
  })
})
