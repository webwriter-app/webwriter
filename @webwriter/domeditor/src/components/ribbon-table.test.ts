// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"
import type {RibbonDrawer} from "./ribbon-drawer"
import {DomEditorToolbox} from "./toolbox"
import type {ElementStyleEditor} from "./element-style-editor"

beforeEach(() => document.body.replaceChildren())

const semanticTableState = {
  hasHeader: false,
  hasFooter: false,
}

describe("table controls", () => {
  it("keeps the table controls in one specialized Edit toolbox drawer", async () => {
    const ribbon = new AppRibbon()
    document.body.append(ribbon)
    await ribbon.updateComplete

    const ribbonLabels = Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label"))
    expect(ribbonLabels).not.toContain("Table")

    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {
      ...semanticTableState,
      active: true,
      cellSelection: false,
      rows: 2,
      columns: 2,
      selectedCells: 1,
      canMerge: false,
      canSplit: false,
      hasCaption: false,
    }
    document.body.append(toolbox)
    await toolbox.updateComplete
    const toolboxLabels = Array.from(toolbox.shadowRoot!.querySelectorAll("ribbon-drawer"))
      .map(drawer => drawer.getAttribute("label"))
    expect(toolboxLabels).toEqual(["Style", "Table"])

    const actionIcons = Array.from(toolbox.shadowRoot!.querySelectorAll<RibbonButton>("ribbon-button"))
      .map(button => button.icon)
    expect(actionIcons).toEqual([
      "TableColumnLeft", "TableRowAbove", "TableColumnRight",
      "TableSplitCells", "TableRowBelow", "TableSplit", "TableMergeCells", "TableHeader", "TableFooter",
    ])
    expect(new Set(actionIcons).size).toBe(actionIcons.length)
    expect(toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Table"] ribbon-button[action="table-header"]')).not.toBeNull()
  })

  it("keeps table commands at the top of the drawer and Languages visible", async () => {
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
      "Style", "Table",
    ])
    const controls = drawers[1].querySelector<HTMLElement>(".table-structure-controls")!
    expect(controls.querySelectorAll("ribbon-button")).toHaveLength(9)
    expect(controls.closest('[slot="more"]')).toBeNull()
    expect(drawers[1].querySelector("element-style-editor")!.previousElementSibling).toBe(controls)
    expect(controls.querySelector(".table-sections")).toBeNull()
    expect(drawers[1].querySelector("element-attribute-editor")!.closest('[slot="more"]')).toBeNull()
    expect(drawers[1].shadowRoot!.querySelector('slot[name="more"]')!.hasAttribute("hidden")).toBe(true)
  })

  it("shows table commands once when table and cell drawers are grouped", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.table = {...semanticTableState, active: true, cellSelection: true, rows: 2, columns: 2,
      selectedCells: 4, canMerge: true, canSplit: false, hasCaption: false}
    toolbox.selectedElementTypes = ["table", "td"].map(localName => ({
      element: {localName, namespaceURI: "http://www.w3.org/1999/xhtml", name: localName, icon: "Table", attributes: {}, path: null},
      style: {target: {localName, namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "table", parentDisplay: "block"}}, count: localName === "table" ? 1 : 4,
      styleProperties: [], configuredWidgetOptions: [],
    }))
    document.body.append(toolbox)
    await toolbox.updateComplete
    const controls = toolbox.shadowRoot!.querySelectorAll(".table-structure-controls")
    expect(controls).toHaveLength(1)
    expect(controls[0].closest("ribbon-drawer")!.getAttribute("data-specialized")).toBe("table")
    expect(toolbox.shadowRoot!.querySelectorAll('ribbon-button[action="table-merge-cells"]')).toHaveLength(1)
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

  it("renders the shared Caption group reflecting native table caption position", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.activeMenu = "Edit"
    toolbox.table = {...semanticTableState, active: true, cellSelection: true, rows: 1, columns: 1, selectedCells: 1, canMerge: false, canSplit: false, hasCaption: true}
    toolbox.elementStyle = {target: {localName: "table", namespaceURI: "http://www.w3.org/1999/xhtml"}, inline: {}, computed: {}, context: {display: "table", parentDisplay: "block"}}
    toolbox.captionPosition = "below"
    const listener = vi.fn()
    toolbox.addEventListener("layout-action", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const below = toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="Caption below, align left"]')!
    expect(below.getAttribute("aria-pressed")).toBe("true")
    toolbox.shadowRoot!.querySelector<HTMLButtonElement>('button[aria-label="No caption"]')!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {type: "setCaption", position: "none"}}))
  })

  it("keeps border and background controls in universal Style", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.table = {
      ...semanticTableState,
      active: true, cellSelection: true, rows: 1, columns: 1, selectedCells: 1,
      canMerge: false, canSplit: false, hasCaption: false,
    }
    document.body.append(toolbox)
    await toolbox.updateComplete
    const root = toolbox.shadowRoot!
    expect(root.querySelector('ribbon-drawer[label="Borders"], ribbon-drawer[label="Background"]')).toBeNull()
    const style = root.querySelector<ElementStyleEditor>('ribbon-drawer[label="Style"] element-style-editor[slot="more"]')!
    await style.updateComplete
    expect(style.shadowRoot!.querySelector('[data-property="border-width"]')).not.toBeNull()
    expect(style.shadowRoot!.querySelector('[data-property="background-color"]')).not.toBeNull()
    const table = root.querySelector('ribbon-drawer[label="Table"]')!
    const fields = Array.from(table.querySelectorAll<ElementStyleEditor>("element-style-editor"))
      .flatMap(editor => editor.propertyNames ?? [])
    expect(fields).not.toContain("border-width")
    expect(fields).not.toContain("background-color")
  })

  it("renders and toggles table header and footer buttons", async () => {
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
      hasHeader: true,
      hasFooter: false,
    }
    const listener = vi.fn()
    toolbox.addEventListener("ribbon-button-click", listener)
    document.body.append(toolbox)
    await toolbox.updateComplete
    const layout = toolbox.shadowRoot!.querySelector('ribbon-drawer[label="Table"]')!
    const header = layout.querySelector<RibbonButton>('ribbon-button[action="table-header"]')!
    const footer = layout.querySelector<RibbonButton>('ribbon-button[action="table-footer"]')!
    await Promise.all([header.updateComplete, footer.updateComplete])
    expect(layout.querySelector('input[type="checkbox"]')).toBeNull()
    expect(header.parentElement).toBe(layout.querySelector(".table-structure-controls"))
    expect(footer.parentElement).toBe(header.parentElement)
    expect(header.icon).toBe("TableHeader")
    expect(footer.icon).toBe("TableFooter")
    const headerButton = header.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    const footerButton = footer.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!
    expect(headerButton.getAttribute("aria-pressed")).toBe("true")
    expect(footerButton.getAttribute("aria-pressed")).toBe("false")
    headerButton.click()
    footerButton.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "table-header", keepDrawerOpen: false}}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "table-footer", keepDrawerOpen: false}}))
  })
  it("disables section toggles when merged cells cross their row boundaries", async () => {
    const toolbox = new DomEditorToolbox()
    toolbox.activeTool = "Edit"
    toolbox.table = {...semanticTableState, active: true, cellSelection: true, rows: 2, columns: 2,
      selectedCells: 1, canMerge: false, canSplit: true, hasCaption: false,
      canToggleHeader: false, canToggleFooter: false}
    document.body.append(toolbox)
    await toolbox.updateComplete
    const buttons = toolbox.shadowRoot!.querySelectorAll<RibbonButton>('ribbon-button[action="table-header"], ribbon-button[action="table-footer"]')
    expect(buttons).toHaveLength(2)
    expect(Array.from(buttons).every(button => button.disabled)).toBe(true)
  })

})
