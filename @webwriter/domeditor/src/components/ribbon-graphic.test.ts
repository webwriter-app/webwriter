// @vitest-environment happy-dom
import {beforeEach, describe, expect, it, vi} from "vitest"
import "@testing-library/jest-dom/vitest"
import {AppRibbon} from "./ribbon"
import type {RibbonButton} from "./ribbon-button"

beforeEach(() => document.body.replaceChildren())

describe("graphic ribbon", () => {
  it("stacks inline controls within the narrow toolbox pane", () => {
    const styles = AppRibbon.styles.toString()

    expect(styles).toMatch(/ribbon-drawer\[pane\] \.graphic-geometry-controls\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
    expect(styles).toMatch(/ribbon-drawer\[pane\] \.graphic-text-controls \.graphic-label-parameter\s*\{[\s\S]*?grid-column:\s*1 \/ -1/)
    expect(styles).toMatch(/ribbon-drawer\[pane\] \.graphic-connector-controls \.graphic-parameter:first-child\s*\{[\s\S]*?grid-column:\s*1 \/ -1/)
    expect(styles).toMatch(/ribbon-drawer\[pane\] \.graphic-arrange-controls\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0, 1fr\)/)
    expect(styles).toMatch(/ribbon-drawer\[pane\] \.graphic-layers-inline\s*\{[\s\S]*?border-inline-start:\s*0/)
  })

  it("does not show graphic editing drawers without a graphic selection", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    document.body.append(ribbon)
    await ribbon.updateComplete

    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Graphic"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Canvas"]')).toBeNull()
  })

  it("inserts an empty graphic from the main button and offers standalone shapes", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Start"
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const graphic = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Elements"] ribbon-button[label="Graphic"]',
    )!
    await graphic.updateComplete

    graphic.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "Graphic", keepDrawerOpen: false}}))
    expect(graphic.submenu.map(item => typeof item === "string" ? item : item.action)).toEqual([
      "insert-graphic-shape:rectangle",
      "insert-graphic-shape:ellipse",
      "insert-graphic-shape:triangle",
      "insert-graphic-shape:diamond",
      "insert-graphic-shape:hexagon",
      "insert-graphic-shape:star",
      "insert-graphic-shape:arrow",
      "insert-graphic-shape:polygon",
      "insert-graphic-shape:line",
      "insert-graphic-shape:connector",
    ])
  })

  it("expands shape insertion as top-level buttons enabled only for a capture-selected drawing area", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {active: true, capture: false}
    document.body.append(ribbon)
    await ribbon.updateComplete
    let shapes = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>(
      'ribbon-drawer[label="Graphic"] ribbon-button[action^="add-graphic-shape:"]',
    ))
    expect(shapes.map(shape => shape.label)).toEqual([
      "Rectangle", "Ellipse", "Triangle", "Diamond", "Hexagon",
      "Star", "Arrow", "Polygon", "Line", "Connector",
    ])
    expect(shapes.every(shape => shape.disabled)).toBe(true)
    expect(shapes.every(shape => shape.submenu.length === 0)).toBe(true)

    ribbon.graphic = {active: true, capture: true, options: {grid: true, snap: true, guides: true}}
    await ribbon.updateComplete
    shapes = Array.from(ribbon.shadowRoot!.querySelectorAll<RibbonButton>(
      'ribbon-drawer[label="Graphic"] ribbon-button[action^="add-graphic-shape:"]',
    ))
    expect(shapes.every(shape => !shape.disabled)).toBe(true)
    expect(Array.from(ribbon.shadowRoot!.querySelectorAll("ribbon-drawer"), drawer => drawer.getAttribute("label"))).toEqual([
      "Graphic", "Geometry", "Text", "Connector", "Arrange", "Canvas",
    ])
  })

  it("maps multi-selection commands into a compact Arrange drawer", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 2,
      parameters: {fill: "#60a5fa", stroke: "#1d4ed8", "stroke-width": "8", opacity: "1"},
      options: {grid: true, snap: true, guides: true},
    }
    document.body.append(ribbon)
    await ribbon.updateComplete

    const align = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Arrange"] ribbon-button[label="Align left"]')!
    const distribute = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Arrange"] ribbon-button[label="Distribute horizontally"]',
    )!
    const order = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Arrange"] ribbon-button[label="Bring forward"]')!
    const fill = ribbon.shadowRoot!.querySelector<HTMLInputElement>(
      'ribbon-drawer[label="Geometry"] input[aria-label="Graphic: Fill color"]',
    )!
    const width = ribbon.shadowRoot!.querySelector<HTMLInputElement>(
      'ribbon-drawer[label="Geometry"] input[aria-label="Graphic: Width"]',
    )!

    expect(align.disabled).toBe(false)
    expect(align.submenu).toHaveLength(0)
    expect(distribute.disabled).toBe(true)
    expect(order.disabled).toBe(false)
    expect(fill.disabled).toBe(false)
    expect(width.disabled).toBe(true)
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Graphic"] ribbon-button[label="Fill"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Geometry"] ribbon-button[label="Geometry"]')).toBeNull()

    ribbon.graphic = {...ribbon.graphic, selectionCount: 3}
    await ribbon.updateComplete
    expect(ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-button[label="Distribute horizontally"]')!.disabled).toBe(false)
  })

  it("reflects selected shape parameters and dispatches edits", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      shape: "rectangle",
      parameters: {
        x: "400", y: "250", width: "800", height: "400", rotation: "0",
        fill: "#60a5fa", stroke: "#1d4ed8", "stroke-width": "12", opacity: "1",
        "corner-radius": "0",
      },
    }
    const listener = vi.fn()
    ribbon.addEventListener("graphic-parameter-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const geometry = ribbon.shadowRoot!.querySelector<HTMLElement>('ribbon-drawer[label="Geometry"] .graphic-geometry-controls')!
    const width = geometry.querySelector<HTMLInputElement>('input[aria-label="Graphic: Width"]')!
    expect(width.value).toBe("800")
    expect(geometry.querySelector('input[aria-label="Graphic: Corner radius"]')).not.toBeNull()
    expect(geometry.querySelector('input[aria-label="Graphic: Fill color"]')).toHaveValue("#60a5fa")
    expect(geometry.querySelector('input[aria-label="Graphic: Stroke color"]')).toHaveValue("#1d4ed8")

    width.value = "960"
    width.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {name: "width", value: "960"}}))
  })

  it("edits native shape labels from the contextual Text drawer", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "rectangle",
      parameters: {label: "Roadmap", "text-color": "#1d4ed8", "font-size": "52"},
    }
    const listener = vi.fn()
    ribbon.addEventListener("graphic-parameter-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const label = ribbon.shadowRoot!.querySelector<HTMLElement>('ribbon-drawer[label="Text"] .graphic-text-controls')!
    const text = label.querySelector<HTMLTextAreaElement>('textarea[aria-label="Graphic: Label"]')!
    const color = label.querySelector<HTMLInputElement>('input[aria-label="Graphic: Text color"]')!
    const size = label.querySelector<HTMLInputElement>('input[aria-label="Graphic: Font size"]')!
    expect(text.value).toBe("Roadmap")
    expect(color.value).toBe("#1d4ed8")
    expect(size.value).toBe("52")

    text.value = "Release plan"
    text.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {name: "label", value: "Release plan"}}))
  })

  it("shows shape-specific geometry controls for stars and arrows", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "star",
      parameters: {"inner-radius": "45"},
    }
    document.body.append(ribbon)
    await ribbon.updateComplete
    let geometry = ribbon.shadowRoot!.querySelector<HTMLElement>('ribbon-drawer[label="Geometry"] .graphic-geometry-controls')!
    expect(geometry.querySelector('input[aria-label="Graphic: Inner radius"]')).toHaveValue(45)

    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "arrow",
      parameters: {"head-size": "36", "tail-width": "42"},
    }
    await ribbon.updateComplete
    geometry = ribbon.shadowRoot!.querySelector<HTMLElement>('ribbon-drawer[label="Geometry"] .graphic-geometry-controls')!
    expect(geometry.querySelector('input[aria-label="Graphic: Head size"]')).toHaveValue(36)
    expect(geometry.querySelector('input[aria-label="Graphic: Tail width"]')).toHaveValue(42)
  })

  it("maps connector routing and arrowheads into a contextual drawer", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "connector",
      parameters: {
        routing: "orthogonal",
        "start-arrow": "false",
        "end-arrow": "true",
      },
    }
    const listener = vi.fn()
    ribbon.addEventListener("graphic-parameter-change", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const routing = ribbon.shadowRoot!.querySelector<HTMLElement>(
      'ribbon-drawer[label="Connector"] .graphic-connector-controls',
    )!
    const select = routing.querySelector<HTMLSelectElement>('select[aria-label="Graphic: Connector routing"]')!
    const startArrow = routing.querySelector<HTMLInputElement>('input[aria-label="Graphic: Start arrow"]')!
    const endArrow = routing.querySelector<HTMLInputElement>('input[aria-label="Graphic: End arrow"]')!
    expect(select.disabled).toBe(false)
    expect(select.value).toBe("orthogonal")
    expect(startArrow.checked).toBe(false)
    expect(endArrow.checked).toBe(true)

    select.value = "straight"
    select.dispatchEvent(new Event("change", {bubbles: true, composed: true}))
    startArrow.checked = true
    startArrow.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(listener).toHaveBeenNthCalledWith(1, expect.objectContaining({detail: {name: "routing", value: "straight"}}))
    expect(listener).toHaveBeenNthCalledWith(2, expect.objectContaining({detail: {name: "start-arrow", value: "true"}}))
  })

  it("reflects canvas options as contextual toggle buttons", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      options: {grid: true, snap: false, guides: true},
    }
    const listener = vi.fn()
    ribbon.addEventListener("ribbon-button-click", listener)
    document.body.append(ribbon)
    await ribbon.updateComplete
    const grid = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Canvas"] ribbon-button[label="Grid"]')!
    const snap = ribbon.shadowRoot!.querySelector<RibbonButton>('ribbon-drawer[label="Canvas"] ribbon-button[label="Snap"]')!
    expect(grid.toggle).toBe(true)
    expect(grid.active).toBe(true)
    expect(snap.active).toBe(false)

    await grid.updateComplete
    grid.shadowRoot!.querySelector<HTMLButtonElement>(".main-button")!.click()
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({detail: {label: "toggle-graphic-option:grid", keepDrawerOpen: false}}))
  })

  it("projects live layers inline in Arrange and viewport controls in Canvas", async () => {
    const ribbon = new AppRibbon()
    ribbon.activeMenu = "Edit"
    ribbon.graphic = {
      active: true,
      capture: true,
      selectionCount: 1,
      shape: "ellipse",
      layers: [
        {index: 0, label: "Background", type: "rectangle", selected: false, primary: false, visible: true, locked: false},
        {index: 1, label: "Milestone", type: "ellipse", selected: true, primary: true, visible: true, locked: false},
      ],
      viewport: {zoom: 150},
    }
    const layerListener = vi.fn()
    const viewportListener = vi.fn()
    ribbon.addEventListener("graphic-layer-action", layerListener)
    ribbon.addEventListener("graphic-viewport-action", viewportListener)
    document.body.append(ribbon)
    await ribbon.updateComplete

    const layers = ribbon.shadowRoot!.querySelector<HTMLElement>(
      'ribbon-drawer[label="Arrange"] .graphic-layers-inline',
    )!
    const milestone = layers.querySelector<HTMLElement>('[data-layer-index="1"]')!
    expect(milestone.dataset.selected).toBe("true")
    milestone.querySelector<HTMLButtonElement>('[aria-label="Hide Milestone"]')!.click()
    milestone.querySelector<HTMLButtonElement>('[aria-label="Lock Milestone"]')!.click()
    layers.querySelector<HTMLButtonElement>('[aria-label="Back layer"]')!.click()

    expect(layerListener).toHaveBeenNthCalledWith(1, expect.objectContaining({
      detail: {operation: "toggle-visibility", index: 1},
    }))
    expect(layerListener).toHaveBeenNthCalledWith(2, expect.objectContaining({
      detail: {operation: "toggle-lock", index: 1},
    }))
    expect(layerListener).toHaveBeenNthCalledWith(3, expect.objectContaining({
      detail: {operation: "send-back", index: 1},
    }))

    const zoom = ribbon.shadowRoot!.querySelector<RibbonButton>(
      'ribbon-drawer[label="Canvas"] ribbon-button[label="150%"]',
    )!
    await zoom.updateComplete
    expect(zoom.shadowRoot!.querySelector("output")).toHaveTextContent("150%")
    zoom.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Zoom in"]')!.click()
    const range = zoom.shadowRoot!.querySelector<HTMLInputElement>('[aria-label="Graphic zoom percentage"]')!
    range.value = "200"
    range.dispatchEvent(new Event("change", {bubbles: true, composed: true}))

    expect(viewportListener).toHaveBeenNthCalledWith(1, expect.objectContaining({detail: {operation: "zoom-in"}}))
    expect(viewportListener).toHaveBeenNthCalledWith(2, expect.objectContaining({
      detail: {operation: "set-zoom", zoom: 200},
    }))
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="View"]')).toBeNull()
    expect(ribbon.shadowRoot!.querySelector('ribbon-drawer[label="Layers"]')).toBeNull()
  })
})
